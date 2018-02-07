'use strict'

const _ = require('lodash')
const File = require('./file')
const fs = require('fs-extra')
const git = require('nodegit')
const { obj: map } = require('through2')
const matcher = require('matcher')
const mimeTypes = require('./mime-types-with-asciidoc')
const ospath = require('path')
const { posix: path } = ospath
const posixify = ospath.sep === '\\' ? (p) => p.replace(/\\/g, '/') : undefined
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const { COMPONENT_DESC_FILENAME, CONTENT_CACHE_PATH, CONTENT_GLOB } = require('./constants')
const DOT_OR_NOEXT_RX = {
  '/': new RegExp('(?:^|/)(?:\\.|[^/.]+$)'),
  '\\': /(?:^|\\)(?:\.|[^\\.]+$)/,
}
const DRIVE_RX = new RegExp('^[a-z]:/(?=[^/]|$)')
const HOSTED_GIT_REPO_RX = new RegExp('(github\\.com|gitlab\\.com|bitbucket\\.org)[:/](.+?)(?:\\.git)?$')
const SEPARATOR_RX = /\/|:/
const TRIM_SEPARATORS_RX = /^\/+|\/+$/g
const URI_SCHEME_RX = /^(?:https?|file|git|ssh):\/\/+/

/**
 * Aggregates files from the specified content sources so they can
 * be loaded into a virtual file catalog.
 *
 * Currently assumes each source points to a local or remote git repositories.
 * Clones the repository, if necessary, then walks the git tree (or worktree)
 * of the specified branches. Creates a virtual file containing the source
 * location and contents for each matched file. The files are then organized by
 * component version.
 *
 * @memberof content-aggregator
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.dir - The working directory of the playbook.
 * @param {Array} playbook.content - An array of content sources.
 *
 * @returns {Object} A map of files organized by component version.
 */
async function aggregateContent (playbook) {
  const defaultBranches = playbook.content.branches
  const componentVersions = await Promise.all(
    playbook.content.sources.map(async (source) => {
      const { repository, localPath, url, remote, isLocal, isBare } = await openOrCloneRepository(
        source.url,
        source.remote,
        playbook.dir || '.'
      )
      const branchPatterns = source.branches || defaultBranches
      const componentVersions = (await selectBranches(repository, isBare, branchPatterns, remote)).map(
        async ({ ref, branchName, isCurrent }) => {
          let startPath = source.startPath || ''
          if (startPath && ~startPath.indexOf('/')) startPath = startPath.replace(TRIM_SEPARATORS_RX, '')
          const worktreePath =
            isCurrent && isLocal && !isBare ? (startPath ? ospath.join(localPath, startPath) : localPath) : undefined
          const files = worktreePath
            ? await readFilesFromWorktree(worktreePath)
            : await readFilesFromGitTree(repository, ref, startPath)
          const componentVersion = loadComponentDescriptor(files)
          const origin = resolveOrigin(url, branchName, startPath, worktreePath)
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
  return buildAggregate(componentVersions)
}

async function openOrCloneRepository (repoUrl, remote, startDir) {
  if (!remote) remote = 'origin'

  let isBare
  let isLocal
  let localPath
  let repository

  // QUESTION should we try to exclude git@host:path as well? maybe check for @?
  if (!~repoUrl.indexOf('://')) {
    if (directoryExists((localPath = ospath.resolve(startDir, repoUrl)))) {
      isBare = !directoryExists(ospath.join(localPath, '.git'))
      isLocal = true
    } else {
      throw new Error(
        'Local content source does not exist: ' +
          localPath +
          (repoUrl !== localPath ? ' (resolved from url: ' + repoUrl + ')' : '')
      )
    }
  } else {
    isBare = true
    isLocal = false
    // NOTE if repository is in cache, we can assume the remote is origin
    remote = 'origin'
    localPath = ospath.join(getCacheDir(), generateLocalFolderName(repoUrl))
  }

  try {
    if (isBare) {
      repository = await git.Repository.openBare(localPath)
      if (!isLocal) {
        // fetch new branches and delete obsolete local ones
        await repository.fetch(remote, Object.assign({ prune: 1 }, getFetchOptions()))
      }
    } else {
      repository = await git.Repository.open(localPath)
    }
  } catch (e) {
    if (isLocal) {
      throw new Error(
        'Local content source must be a git repository: ' +
          localPath +
          (repoUrl !== localPath ? ' (resolved from url: ' + repoUrl + ')' : '')
      )
    } else {
      // NOTE if we clone the repository, we can assume the remote is origin
      remote = 'origin'
      repository = await fs
        .remove(localPath)
        .then(() => git.Clone.clone(repoUrl, localPath, { bare: 1, fetchOpts: getFetchOptions() }))
    }
  }

  let url
  try {
    url = (await repository.getRemote(remote)).url()
  } catch (e) {
    // FIXME use repository.path() if repository is set
    url = repoUrl
  }

  return { repository, localPath, url, remote, isLocal, isBare }
}

/**
 * Checks whether the specified URL resolves to a directory on the local filesystem.
 *
 * @param {String} url - The URL to check.
 * @return {Boolean} - A flag indicating whether the URL resolves to a directory on the local filesystem.
 */
function directoryExists (url) {
  try {
    return fs.statSync(url).isDirectory()
  } catch (e) {
    return false
  }
}

/**
 * Resolves the location of the content cache directory.
 *
 * @return {String} - The absolute directory path.
 */
function getCacheDir () {
  const cacheAbsPath = ospath.resolve(CONTENT_CACHE_PATH)
  fs.ensureDirSync(cacheAbsPath)
  return cacheAbsPath
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
 * @return {String} - A friendly folder name.
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

function getFetchOptions () {
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
    },
  }
}

async function selectBranches (repo, isBare, branchPatterns, remote) {
  if (branchPatterns) {
    if (branchPatterns === 'HEAD' || branchPatterns === '.') {
      branchPatterns = [(await repo.getCurrentBranch()).shorthand()]
    } else if (Array.isArray(branchPatterns)) {
      let currentBranchIdx
      if (~(currentBranchIdx = branchPatterns.indexOf('HEAD')) || ~(currentBranchIdx = branchPatterns.indexOf('.'))) {
        branchPatterns[currentBranchIdx] = (await repo.getCurrentBranch()).shorthand()
      }
    } else {
      branchPatterns = [branchPatterns]
    }
  }

  return Object.values(
    (await repo.getReferences(git.Reference.TYPE.OID)).reduce((accum, ref) => {
      const segments = ref.name().split('/')
      let branch
      let branchName
      if (segments[1] === 'heads') {
        branchName = segments.slice(2).join('/')
        branch = { ref, branchName, isCurrent: !!ref.isHead() }
      } else if (segments[1] === 'remotes' && segments[2] === remote) {
        branchName = segments.slice(3).join('/')
        branch = { ref, branchName, remote }
      } else {
        return accum
      }

      // NOTE if branch is present in accum, we already know it matches the pattern
      if (branchName in accum) {
        if (!branch.remote || isBare) accum[branchName] = branch
      } else if (!branchPatterns || matcher([branchName], branchPatterns).length) {
        accum[branchName] = branch
      }

      return accum
    }, {})
  )
}

function loadComponentDescriptor (files) {
  const descriptorFileIdx = files.findIndex((file) => file.path === COMPONENT_DESC_FILENAME)
  if (descriptorFileIdx < 0) {
    throw new Error(COMPONENT_DESC_FILENAME + ' not found')
  }

  const descriptorFile = files[descriptorFileIdx]
  files.splice(descriptorFileIdx, 1)
  const data = yaml.safeLoad(descriptorFile.contents.toString())
  if (data.name == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' is missing a name')
  } else if (data.version == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' is missing a version')
  }

  return data
}

async function readFilesFromGitTree (repository, branchRef, startPath) {
  return srcGitTree(await getGitTree(repository, branchRef, startPath))
}

async function getGitTree (repository, branchRef, startPath) {
  const commit = await repository.getBranchCommit(branchRef)
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
    const excludePattern = DOT_OR_NOEXT_RX[ospath.sep]
    const files = []
    // NOTE walk only visits blobs (i.e., files)
    const walker = tree.walk()
    // NOTE ignore dotfiles and extensionless files; convert remaining entries to File objects
    walker.on('entry', (entry) => {
      if (!excludePattern.test(entry.path())) files.push(entryToFile(entry))
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

function resolveOrigin (url, branch, startPath, worktreePath) {
  let match
  const origin = { type: 'git', url, branch, startPath }
  if (worktreePath) {
    origin.editUrlPattern = 'file://' + (posixify ? '/' + posixify(worktreePath) : worktreePath) + '/%s'
    // Q: should we set worktreePath instead (or additionally?)
    origin.worktree = true
  } else if ((match = url.match(HOSTED_GIT_REPO_RX))) {
    const action = match[1] === 'bitbucket.org' ? 'src' : 'edit'
    origin.editUrlPattern = 'https://' + path.join(match[1], match[2], action, branch, startPath, '%s')
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
module.exports._resolveOrigin = resolveOrigin
