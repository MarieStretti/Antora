'use strict'

const _ = require('lodash')
const expandPath = require('@antora/expand-path-helper')
const File = require('./file')
const fs = require('fs-extra')
const getCacheDir = require('cache-directory')
const git = require('nodegit')
const { obj: map } = require('through2')
const matcher = require('matcher')
const mimeTypes = require('./mime-types-with-asciidoc')
const MultiProgress = require('multi-progress')
const ospath = require('path')
const { posix: path } = ospath
const posixify = ospath.sep === '\\' ? (p) => p.replace(/\\/g, '/') : undefined
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const { COMPONENT_DESC_FILENAME, CONTENT_CACHE_FOLDER, CONTENT_GLOB } = require('./constants')
const DOT_OR_NOEXT_RX = ((sep) => new RegExp(`(?:^|[${sep}])(?:\\.|[^${sep}.]+$)`))(
  Array.from(new Set(['/', ospath.sep]))
    .join('')
    .replace('\\', '\\\\')
)
const DRIVE_RX = /^[a-z]:\/(?=[^/]|$)/
const GIT_URI_DETECTOR_RX = /:(?:\/\/|[^/\\])/
const HOSTED_GIT_REPO_RX = /(github\.com|gitlab\.com|bitbucket\.org)[:/](.+?)(?:\.git)?$/
const SEPARATOR_RX = /\/|:/
const TRIM_SEPARATORS_RX = /^\/+|\/+$/g
const URI_SCHEME_RX = /^(?:https?|file|git|ssh):\/\/+/

/**
 * Aggregates files from the specified content sources so they can
 * be loaded into a virtual file catalog.
 *
 * Currently assumes each source points to a local or remote git repository.
 * Clones the repository, if necessary, then walks the git tree (or worktree)
 * of the specified branches and tags. Creates a virtual file containing the
 * source location and contents for each file matched. The files are then
 * organized by component version.
 *
 * @memberof content-aggregator
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.dir - The working directory of the playbook.
 * @param {Object} playbook.runtime - The runtime configuration object for Antora.
 * @param {String} [playbook.runtime.cacheDir=undefined] - The base cache directory.
 * @param {Array} playbook.content - An array of content sources.
 *
 * @returns {Object} A map of files organized by component version.
 */
async function aggregateContent (playbook) {
  const playbookDir = playbook.dir || '.'
  const { branches: defaultBranches, tags: defaultTags, sources } = playbook.content
  const { cacheDir, pull, silent, quiet } = playbook.runtime
  const progress = {}
  const term = process.stdout
  if (!(quiet || silent) && term.isTTY && term.columns >= 60) {
    //term.write('Aggregating content...\n')
    // QUESTION should we use MultiProgress directly as our progress object?
    progress.manager = new MultiProgress(term)
    progress.maxLabelWidth = Math.min(
      Math.ceil((term.columns - 8) / 2),
      sources.reduce(
        (max, { url }) => Math.max(max, ~url.indexOf(':') && GIT_URI_DETECTOR_RX.test(url) ? url.length : 0),
        0
      )
    )
  }
  return ensureCacheDir(cacheDir, playbookDir).then((cacheAbsDir) =>
    Promise.all(
      sources.map(async (source) => {
        const { repository, repoPath, url, remoteName, isRemote, isBare } = await openOrCloneRepository(source.url, {
          pull,
          remoteName: source.remote,
          startDir: playbookDir,
          cacheDir: cacheAbsDir,
          progress,
        })
        const branchPatterns = source.branches || defaultBranches
        const tagPatterns = source.tags || defaultTags
        const componentVersions = (await selectRefs(repository, branchPatterns, tagPatterns, isBare, remoteName)).map(
          async ({ ref, name: refName, type: refType, isHead }) => {
            let startPath = source.startPath || ''
            if (startPath && ~startPath.indexOf('/')) startPath = startPath.replace(TRIM_SEPARATORS_RX, '')
            const worktreePath =
              isHead && !(isRemote || isBare) ? (startPath ? ospath.join(repoPath, startPath) : repoPath) : undefined
            const files = worktreePath
              ? await readFilesFromWorktree(worktreePath)
              : await readFilesFromGitTree(repository, ref, startPath)
            const componentVersion = loadComponentDescriptor(files, source.url)
            const origin = computeOrigin(url, refName, refType, startPath, worktreePath)
            componentVersion.files = files.map((file) => assignFileProperties(file, origin))
            return componentVersion
          }
        )
        // nodegit repositories must be manually closed
        return Promise.all(componentVersions)
          .then((resolvedValue) => {
            repository.free()
            return resolvedValue
          })
          .catch((reason) => {
            repository.free()
            throw reason
          })
      })
    )
      .then((componentVersions) => buildAggregate(componentVersions))
      .catch((reason) => {
        progress.manager && progress.manager.terminate()
        throw reason
      })
  )
}

async function openOrCloneRepository (repoUrl, opts) {
  let isBare
  let isRemote
  let remoteName
  let repoPath
  let repository
  let url

  if (~repoUrl.indexOf(':') && GIT_URI_DETECTOR_RX.test(repoUrl)) {
    isBare = true
    isRemote = true
    // NOTE if repository is in cache, we can assume the remote name is origin
    remoteName = 'origin'
    repoPath = ospath.join(opts.cacheDir, generateLocalFolderName(repoUrl))
    url = repoUrl
  } else if (directoryExists((repoPath = expandPath(repoUrl, '~+', opts.startDir)))) {
    isBare = !directoryExists(ospath.join(repoPath, '.git'))
    isRemote = false
    remoteName = opts.remoteName || 'origin'
  } else {
    throw new Error(
      'Local content source does not exist: ' +
        repoPath +
        (repoUrl !== repoPath ? ' (resolved from url: ' + repoUrl + ')' : '')
    )
  }

  try {
    if (isBare) {
      repository = await git.Repository.openBare(repoPath)
      if (isRemote && opts.pull) {
        const progress = opts.progress
        const fetchOpts = getFetchOptions(progress, repoUrl, 'fetch')
        // fetch new refs and delete obsolete local ones
        await repository.fetch(remoteName, Object.assign({ prune: 1 }, fetchOpts)).then((repo) => {
          if (progress.manager) completeProgress(fetchOpts.callbacks.transferProgress.progressBar)
          return repo
        })
      }
    } else {
      repository = await git.Repository.open(repoPath)
    }
  } catch (e) {
    if (isRemote) {
      const progress = opts.progress
      const fetchOpts = getFetchOptions(progress, repoUrl, 'clone')
      repository = await fs
        .remove(repoPath)
        .then(() => git.Clone.clone(repoUrl, repoPath, { bare: 1, fetchOpts }))
        .then((repo) =>
          repo.getCurrentBranch().then((ref) => {
            // NOTE we have a test that will catch if nodegit changes to match behavior of native git client
            repo.detachHead()
            ref.delete()
            if (progress.manager) completeProgress(fetchOpts.callbacks.transferProgress.progressBar)
            return repo
          })
        )
    } else {
      throw new Error(
        'Local content source must be a git repository: ' +
          repoPath +
          (repoUrl !== repoPath ? ' (resolved from url: ' + repoUrl + ')' : '')
      )
    }
  }

  if (!url) {
    try {
      url = (await repository.getRemote(remoteName)).url()
    } catch (e) {
      // Q: should we make this a file URI?
      url = repoPath
    }
  }

  return { repository, repoPath, url, remoteName, isRemote, isBare }
}

/**
 * Checks whether the specified URL resolves to a directory on the local filesystem.
 *
 * @param {String} url - The URL to check.
 * @return {Boolean} A flag indicating whether the URL resolves to a directory on the local filesystem.
 */
function directoryExists (url) {
  try {
    return fs.statSync(url).isDirectory()
  } catch (e) {
    return false
  }
}

/**
 * Resolves the content cache directory and ensures it exists.
 *
 * @param {String} customCacheDir - The custom base cache directory. If the value is undefined,
 *   the user's cache folder is used.
 * @param {String} startDir - The directory from which to resolve a leading '.' segment.
 *
 * @returns {Promise<String>} A promise that resolves to the absolute content cache directory.
 */
function ensureCacheDir (customCacheDir, startDir) {
  // QUESTION should fallback directory be relative to cwd, playbook dir, or tmpdir?
  const baseCacheDir =
    customCacheDir == null
      ? getCacheDir('antora' + (process.env.NODE_ENV === 'test' ? '-test' : '')) || ospath.resolve('.antora/cache')
      : expandPath(customCacheDir, '~+', startDir)
  const cacheDir = ospath.join(baseCacheDir, CONTENT_CACHE_FOLDER)
  return fs.ensureDir(cacheDir).then(() => cacheDir)
}

/**
 * Generates a friendly folder name from a URL.
 *
 * - Remove ending .git path segment
 * - Remove URI scheme (e.g,. https://)
 * - Remove user from host (e.g., git@)
 * - Remove leading and trailing slashes
 * - Replace / and : with %
 * - Append .git (as a file extension)
 *
 * @param {String} url - The repository URL to convert.
 * @return {String} A friendly folder name.
 */
function generateLocalFolderName (url) {
  url = url.toLowerCase()
  // NOTE we don't check extname since the last path segment could equal .git
  if (url.endsWith('.git')) url = url.substr(0, url.length - 4)
  const schemeMatch = ~url.indexOf('://') && url.match(URI_SCHEME_RX)
  if (schemeMatch) url = url.substr(schemeMatch[0].length)
  if (posixify) {
    url = posixify(url)
    const driveMatch = ~url.indexOf(':/') && url.match(DRIVE_RX)
    if (driveMatch) url = driveMatch[0].charAt() + url.substr(2)
  }
  const lastIdx = url.length - 1
  if (url.charAt(lastIdx) === '/') url = url.substr(0, lastIdx)
  const segments = url.split(SEPARATOR_RX)
  let firstSegment = segments[0]
  if (firstSegment.length === 0) {
    segments.shift()
  } else {
    const atIdx = firstSegment.indexOf('@')
    if (~atIdx) firstSegment = firstSegment.substr(atIdx + 1)
    segments[0] = firstSegment
  }
  return segments.join('%') + '.git'
}

// QUESTION should we create dedicate instance of progress and set progress.label?
function getFetchOptions (progress, progressLabel, operation) {
  let sshKeyAuthAttempted
  return {
    callbacks: {
      // https://github.com/nodegit/nodegit/blob/master/guides/cloning/ssh-with-agent/README.md#github-certificate-issue-in-os-x
      certificateCheck: () => 1,
      credentials: (_, username) => {
        if (sshKeyAuthAttempted) {
          throw new Error('Failed to authenticate git client using SSH key; SSH agent is not running')
        } else {
          sshKeyAuthAttempted = true
          return git.Cred.sshKeyFromAgent(username)
        }
      },
      transferProgress: progress.manager ? createTransferProgress(progress, progressLabel, operation) : undefined,
    },
  }
}

function createTransferProgress (progress, progressLabel, operation) {
  const progressBar = progress.manager.newBar(formatProgressBar(progressLabel, progress.maxLabelWidth, operation), {
    total: Infinity,
    complete: '#',
    incomplete: '-',
  })
  progressBar.tick(0)
  const callback = async (transferStatus) => {
    let growth = transferStatus.receivedObjects() + transferStatus.indexedObjects()
    if (progressBar.total === Infinity) {
      progressBar.total = transferStatus.totalObjects() * 2
    } else {
      growth -= progressBar.curr
    }
    if (growth) progressBar.tick(growth)
  }
  return { callback, progressBar, waitForResult: false }
}

function formatProgressBar (label, maxLabelWidth, operation) {
  const paddingSize = maxLabelWidth - label.length
  let padding = ''
  if (paddingSize < 0) {
    label = '...' + label.substr(-paddingSize + 3)
  } else if (paddingSize) {
    padding = ' '.repeat(paddingSize)
  }
  // NOTE assume operation has a fixed length
  return `[${operation}] ${label}${padding} [:bar]`
}

function completeProgress (progressBar) {
  if (progressBar.total === Infinity) progressBar.total = 100
  const remaining = progressBar.total - progressBar.curr
  if (remaining) progressBar.tick(remaining)
}

async function selectRefs (repo, branchPatterns, tagPatterns, isBare, remote) {
  if (branchPatterns) {
    if (branchPatterns === 'HEAD' || branchPatterns === '.') {
      branchPatterns = [(await repo.getCurrentBranch()).shorthand()]
    } else if (Array.isArray(branchPatterns)) {
      if (branchPatterns.length) {
        let currentBranchIdx
        if (~(currentBranchIdx = branchPatterns.indexOf('HEAD')) || ~(currentBranchIdx = branchPatterns.indexOf('.'))) {
          branchPatterns[currentBranchIdx] = (await repo.getCurrentBranch()).shorthand()
        }
      } else {
        branchPatterns = undefined
      }
    } else {
      branchPatterns = [branchPatterns]
    }
  }

  if (tagPatterns && !Array.isArray(tagPatterns)) tagPatterns = [tagPatterns]

  return Object.values(
    (await repo.getReferences(git.Reference.TYPE.OID)).reduce((accum, ref) => {
      let segments
      let name
      let refData
      if (ref.isTag()) {
        if (tagPatterns && matcher([(name = ref.shorthand())], tagPatterns).length) {
          accum.push({ ref, name, type: 'tag' })
        }
        return accum
      } else if (!branchPatterns) {
        return accum
      } else if ((segments = ref.name().split('/'))[1] === 'heads') {
        name = ref.shorthand()
        refData = { ref, name, type: 'branch', isHead: !!ref.isHead() }
      } else if (segments[1] === 'remotes' && segments[2] === remote) {
        name = segments.slice(3).join('/')
        refData = { ref, name, type: 'branch', remote }
      } else {
        return accum
      }

      // NOTE if branch is present in accum, we already know it matches the pattern
      if (name in accum) {
        if (isBare === !!refData.remote) accum[name] = refData
      } else if (branchPatterns && matcher([name], branchPatterns).length) {
        accum[name] = refData
      }

      return accum
    }, [])
  )
}

function loadComponentDescriptor (files, repoUrl) {
  const descriptorFileIdx = files.findIndex((file) => file.path === COMPONENT_DESC_FILENAME)
  if (descriptorFileIdx < 0) {
    throw new Error(COMPONENT_DESC_FILENAME + ' not found in ' + repoUrl)
  }

  const descriptorFile = files[descriptorFileIdx]
  files.splice(descriptorFileIdx, 1)
  const data = yaml.safeLoad(descriptorFile.contents.toString())
  if (data.name == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' is missing a name in ' + repoUrl)
  } else if (data.version == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' is missing a version in ' + repoUrl)
  }

  return data
}

async function readFilesFromGitTree (repository, ref, startPath) {
  return srcGitTree(await getGitTree(repository, ref, startPath))
}

async function getGitTree (repository, ref, startPath) {
  let commit
  if (ref.isTag()) {
    commit = await ref.peel(git.Object.TYPE.COMMIT).then((target) => repository.getCommit(target))
  } else {
    commit = await repository.getBranchCommit(ref)
  }
  if (startPath) {
    const tree = await commit.getTree()
    const subTreeEntry = await tree.getEntry(startPath)
    return repository.getTree(subTreeEntry.id())
  } else {
    return commit.getTree()
  }
}

function srcGitTree (tree) {
  return new Promise((resolve, reject) => {
    const files = []
    // NOTE walk only visits blobs (i.e., files)
    const walker = tree.walk()
    // NOTE ignore dotfiles and extensionless files; convert remaining entries to File objects
    walker.on('entry', (entry) => {
      if (!DOT_OR_NOEXT_RX.test(entry.path())) files.push(entryToFile(entry))
    })
    walker.on('error', reject)
    walker.on('end', () => resolve(Promise.all(files)))
    walker.start()
  })
}

async function entryToFile (entry) {
  const blob = await entry.getBlob()
  const contents = blob.content()
  const stat = new fs.Stats()
  stat.mode = entry.filemode()
  stat.size = contents.length
  // nodegit currently returns paths containing backslashes on Windows; see nodegit#1433
  return new File({ path: posixify ? posixify(entry.path()) : entry.path(), contents, stat })
}

function readFilesFromWorktree (base) {
  return new Promise((resolve, reject) => {
    const opts = { base, cwd: base, removeBOM: false }
    vfs
      .src(CONTENT_GLOB, opts)
      .on('error', reject)
      .pipe(relativizeFiles())
      .pipe(collectFiles(resolve))
  })
}

/**
 * Transforms the path of every file in the stream to a relative posix path.
 *
 * Applies a mapping function to all files in the stream so they end up with a
 * posixified path relative to the file's base instead of the filesystem root.
 * This mapper also filters out any directories (indicated by file.isNull())
 * that got caught up in the glob.
 */
function relativizeFiles () {
  return map((file, enc, next) => {
    if (file.isNull()) {
      next()
    } else {
      next(
        null,
        new File({
          path: posixify ? posixify(file.relative) : file.relative,
          contents: file.contents,
          stat: file.stat,
          src: { abspath: file.path },
        })
      )
    }
  })
}

function collectFiles (done) {
  const accum = []
  return map((file, enc, next) => accum.push(file) && next(), () => done(accum))
}

function assignFileProperties (file, origin) {
  const extname = file.extname
  file.mediaType = mimeTypes.lookup(extname)
  if (!file.src) file.src = {}
  Object.assign(file.src, {
    path: file.path,
    basename: file.basename,
    stem: file.stem,
    extname,
    mediaType: file.mediaType,
    origin,
  })
  if (origin.editUrlPattern) file.src.editUrl = origin.editUrlPattern.replace('%s', file.src.path)
  return file
}

function computeOrigin (url, refName, refType, startPath, worktreePath = undefined) {
  let match
  const origin = { type: 'git', url, startPath }
  origin[refType] = refName
  if (worktreePath) {
    origin.editUrlPattern = 'file://' + (posixify ? '/' + posixify(worktreePath) : worktreePath) + '/%s'
    // Q: should we set worktreePath instead (or additionally?)
    origin.worktree = true
  } else if ((match = url.match(HOSTED_GIT_REPO_RX))) {
    const action = match[1] === 'bitbucket.org' ? 'src' : refType === 'branch' ? 'edit' : 'blob'
    origin.editUrlPattern = 'https://' + path.join(match[1], match[2], action, refName, startPath, '%s')
  }
  return origin
}

function buildAggregate (componentVersions) {
  return _(componentVersions)
    .flatten()
    .groupBy(({ name, version }) => `${version}@${name}`)
    .map((componentVersions, id) => {
      const component = _(componentVersions)
        .map((a) => _.omit(a, 'files'))
        .reduce((a, b) => _.assign(a, b), {})
      component.files = _(componentVersions)
        .map('files')
        .reduce((a, b) => [...a, ...b], [])
      return component
    })
    .sortBy(['name', 'version'])
    .value()
}

module.exports = aggregateContent
module.exports._computeOrigin = computeOrigin
