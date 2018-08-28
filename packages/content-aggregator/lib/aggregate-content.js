'use strict'

const _ = require('lodash')
const { createHash } = require('crypto')
const expandPath = require('@antora/expand-path-helper')
const File = require('./file')
const fs = require('fs-extra')
const getCacheDir = require('cache-directory')
const git = require('nodegit')
const GIT_TYPE_OID = git.Reference.TYPE.OID
const GIT_TYPE_COMMIT = git.Object.TYPE.COMMIT
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
const ANY_SEPARATOR_RX = /[:/]/
const CSV_RX = /\s*,\s*/
const DOT_OR_NOEXT_RX = /(?:^|\/)(?:\.|[^/.]+$)/
const GIT_URI_DETECTOR_RX = /:(?:\/\/|[^/\\])/
const HOSTED_GIT_REPO_RX = /(github\.com|gitlab\.com|bitbucket\.org)[:/](.+?)(?:\.git)?$/
const NON_UNIQUE_URI_SUFFIX_RX = /(?:\/?\.git|\/)$/
const PERIPHERAL_SEPARATOR_RX = /^\/+|\/+$/g
const URL_AUTH_EXTRACTOR_RX = /^(https?:\/\/)(?:([^/:@]+)(?::([^/@]+))?@)?(.*)/

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
 * @returns {Promise<Object>} A map of files organized by component version.
 */
function aggregateContent (playbook) {
  const startDir = playbook.dir || '.'
  const { branches: defaultBranches, tags: defaultTags, sources } = playbook.content
  const sourcesByUrl = _.groupBy(sources, 'url')
  const { cacheDir, pull, silent, quiet } = playbook.runtime
  const progress = {}
  const term = process.stdout
  if (!(quiet || silent) && term.isTTY && term.columns >= 60) {
    //term.write('Aggregating content...\n')
    // QUESTION should we use MultiProgress directly as our progress object?
    progress.manager = new MultiProgress(term)
    progress.maxLabelWidth = Math.min(
      Math.ceil((term.columns - 8) / 2),
      Object.keys(sourcesByUrl).reduce(
        (max, url) =>
          Math.max(max, ~url.indexOf(':') && GIT_URI_DETECTOR_RX.test(url) ? extractCredentials(url).url.length : 0),
        0
      )
    )
  }
  return ensureCacheDir(cacheDir, startDir).then((absCacheDir) =>
    Promise.all(
      _.map(sourcesByUrl, (sources, url) =>
        loadRepository(url, { pull, startDir, cacheDir: absCacheDir, progress }).then(
          ({ repo, repoUrl, repoPath, isRemote }) =>
            Promise.all(
              sources.map((source) => {
                const refPatterns = { branches: source.branches || defaultBranches, tags: source.tags || defaultTags }
                // NOTE if repository is in cache, we can assume the remote name is origin
                const remoteName = isRemote ? 'origin' : source.remote || 'origin'
                return collectComponentVersions(source, repo, repoUrl, repoPath, isRemote, remoteName, refPatterns)
              })
            )
              .then((componentVersions) => {
                repo.free()
                return componentVersions
              })
              .catch((err) => {
                repo.free()
                throw err
              })
        )
      )
    )
      .then((allComponentVersions) => buildAggregate(allComponentVersions))
      .catch((err) => {
        progress.manager && progress.manager.terminate()
        throw err
      })
  )
}

function buildAggregate (componentVersions) {
  return _(componentVersions)
    .flattenDepth(2)
    .groupBy(({ name, version }) => `${version}@${name}`)
    .map((componentVersions, id) => {
      const component = _(componentVersions)
        .map((a) => _.omit(a, 'files'))
        .reduce((a, b) => _.assign(a, b), {})
      component.files = _(componentVersions)
        .map('files')
        .reduce((a, b) => a.concat(b), [])
      return component
    })
    .sortBy(['name', 'version'])
    .value()
}

async function loadRepository (url, opts) {
  let credentials
  let isBare
  let isRemote
  let repo
  let dir

  if (~url.indexOf(':') && GIT_URI_DETECTOR_RX.test(url)) {
    isBare = isRemote = true
    ;({ url, credentials } = extractCredentials(url))
    dir = ospath.join(opts.cacheDir, generateCloneFolderName(url))
  } else if (isLocalDirectory((dir = expandPath(url, '~+', opts.startDir)))) {
    isBare = !isLocalDirectory(ospath.join(dir, '.git'))
    isRemote = false
  } else {
    throw new Error(
      `Local content source does not exist: ${dir}${url !== dir ? ' (resolved from url: ' + url + ')' : ''}`
    )
  }

  try {
    if (isBare) {
      repo = await git.Repository.openBare(dir)
      if (isRemote && opts.pull) {
        const progress = opts.progress
        const fetchOpts = Object.assign(
          { prune: 1, downloadTags: git.Remote.AUTOTAG_OPTION.DOWNLOAD_TAGS_ALL },
          getFetchOptions(progress, url, credentials, 'fetch')
        )
        // fetch new refs and delete obsolete local ones
        await repo.fetch('origin', fetchOpts)
        if (progress.manager) completeProgress(fetchOpts.callbacks.transferProgress.progressBar)
      }
    } else {
      repo = await git.Repository.open(dir)
    }
  } catch (e) {
    if (isRemote) {
      const progress = opts.progress
      const fetchOpts = getFetchOptions(progress, url, credentials, 'clone')
      repo = await fs
        .remove(dir)
        .then(() => git.Clone.clone(url, dir, { bare: 1, fetchOpts }))
        .catch((err) => {
          let msg = err.message
          if (~msg.indexOf('invalid cred') || ~msg.indexOf('SSH credentials') || ~msg.indexOf('status code: 401')) {
            msg = 'Content repository not found or you have insufficient credentials to access it'
          } else if (~msg.indexOf('no auth sock variable') || ~msg.indexOf('failed connecting agent')) {
            msg = 'SSH agent must be running to access content repository via SSH'
          } else if (/not found|not be found|not exist|404/.test(msg)) {
            msg = 'Content repository not found'
          } else {
            msg = msg.replace(/\.?\s*$/, '')
          }
          throw new Error(msg + ': ' + url)
        })
        .then((repo) =>
          repo.getCurrentBranch().then((ref) =>
            // NOTE nodegit does not create references in a bare repository correctly
            // NOTE we have a test that will detect if nodegit changes to match behavior of native git client
            git.Reference.symbolicCreate(repo, 'HEAD', 'refs/remotes/origin/' + ref.shorthand(), 1, 'remap HEAD').then(
              () => {
                ref.delete()
                if (progress.manager) completeProgress(fetchOpts.callbacks.transferProgress.progressBar)
                return repo
              }
            )
          )
        )
    } else {
      throw new Error(
        `Local content source must be a git repository: ${dir}${url !== dir ? ' (resolved from url: ' + url + ')' : ''}`
      )
    }
  }
  // NOTE return repoPath separately since the nodegit Repository API doesn't always return same value
  return { repo, repoUrl: url, repoPath: dir, isRemote }
}

function extractCredentials (url) {
  if ((url.startsWith('https://') || url.startsWith('http://')) && url.includes('@')) {
    const [, scheme, username, password, rest] = url.match(URL_AUTH_EXTRACTOR_RX)
    // GitHub: <token>@ or <token>:x-oauth-basic@
    // GitLab: oauth2:<token>@
    // BitBucket: x-token-auth:token@
    return { url: scheme + rest, credentials: { username, password: password || '' } }
  } else {
    return { url }
  }
}

async function collectComponentVersions (source, repo, repoUrl, repoPath, isRemote, remoteName, refPatterns) {
  return selectReferences(repo, remoteName, refPatterns).then((refs) =>
    Promise.all(refs.map((ref) => populateComponentVersion(source, repo, repoUrl, repoPath, isRemote, remoteName, ref)))
  )
}

async function selectReferences (repo, remote, refPatterns) {
  let { branches: branchPatterns, tags: tagPatterns } = refPatterns
  let isBare = !!repo.isBare()
  const refs = new Map()

  if (tagPatterns) {
    tagPatterns = Array.isArray(tagPatterns)
      ? tagPatterns.map((pattern) => String(pattern))
      : String(tagPatterns).split(CSV_RX)
  }

  if (branchPatterns) {
    if (branchPatterns === 'HEAD' || branchPatterns === '.') {
      if (repo.headDetached()) {
        refs.set('HEAD', { obj: await repo.head(), name: 'HEAD', qname: 'HEAD', type: 'branch', isHead: true })
        if (tagPatterns && tagPatterns.length) {
          branchPatterns = undefined
        } else {
          return [refs.get('HEAD')]
        }
      } else {
        branchPatterns = [await getCurrentBranchName(repo)]
      }
    } else {
      branchPatterns = Array.isArray(branchPatterns)
        ? branchPatterns.map((pattern) => String(pattern))
        : String(branchPatterns).split(CSV_RX)
      if (branchPatterns.length) {
        let currentBranchIdx
        if (~(currentBranchIdx = branchPatterns.indexOf('HEAD')) || ~(currentBranchIdx = branchPatterns.indexOf('.'))) {
          if (repo.headDetached()) {
            refs.set('HEAD', { obj: await repo.head(), name: 'HEAD', qname: 'HEAD', type: 'branch', isHead: true })
            if (branchPatterns.length > 1) {
              branchPatterns.splice(currentBranchIdx, 1)
            } else if (tagPatterns && tagPatterns.length) {
              branchPatterns = undefined
            } else {
              return [refs.get('HEAD')]
            }
          } else {
            branchPatterns[currentBranchIdx] = await getCurrentBranchName(repo)
          }
        }
      } else {
        branchPatterns = undefined
      }
    }
  }

  return Array.from(
    (await repo.getReferences(GIT_TYPE_OID))
      .reduce((accum, ref) => {
        let segments
        let name
        let refData
        if (ref.isTag()) {
          if (tagPatterns && matcher([(name = ref.shorthand())], tagPatterns).length) {
            // NOTE tags are stored using symbol keys to distinguish them from branches
            accum.set(Symbol(name), { obj: ref, name, qname: `tags/${name}`, type: 'tag' })
          }
          return accum
        } else if (!branchPatterns) {
          return accum
        } else if ((segments = ref.name().split('/'))[1] === 'heads') {
          name = segments.slice(2).join('/')
          refData = { obj: ref, name, qname: name, type: 'branch', isHead: !!ref.isHead() }
        } else if (ref.isRemote() && segments[2] === remote) {
          name = segments.slice(3).join('/')
          refData = { obj: ref, name, qname: `remotes/${remote}/${name}`, type: 'branch', remote }
        } else {
          return accum
        }

        // NOTE if branch is present in accum, we already know it matches the pattern
        if (accum.has(name)) {
          if (isBare === !!refData.remote) accum.set(name, refData)
        } else if (branchPatterns && matcher([name], branchPatterns).length) {
          accum.set(name, refData)
        }

        return accum
      }, refs)
      .values()
  )
}

function getCurrentBranchName (repo) {
  return repo.getCurrentBranch().then((ref) => {
    const refName = ref.shorthand()
    return ref.isRemote() ? refName.substr(refName.indexOf('/') + 1) : refName
  })
}

async function populateComponentVersion (source, repo, url, repoPath, isRemote, remoteName, ref) {
  if (!isRemote) url = await resolveRemoteUrl(repo, repoPath, remoteName)
  let startPath = source.startPath || ''
  if (startPath && ~startPath.indexOf('/')) startPath = startPath.replace(PERIPHERAL_SEPARATOR_RX, '')
  // Q: should worktreePath be passed in?
  const worktreePath = ref.isHead && !(isRemote || repo.isBare()) ? ospath.join(repoPath, startPath) : undefined
  let files
  let componentVersion
  try {
    files = worktreePath
      ? await readFilesFromWorktree(worktreePath, startPath)
      : await readFilesFromGitTree(repo, ref.obj, startPath)
    componentVersion = loadComponentDescriptor(files, startPath)
  } catch (e) {
    e.message += ` in ${isRemote ? url : repoPath} [ref: ${ref.qname}${worktreePath ? ' <worktree>' : ''}]`
    throw e
  }
  const origin = computeOrigin(url, ref.name, ref.type, startPath, worktreePath)
  componentVersion.files = files.map((file) => assignFileProperties(file, origin))
  return componentVersion
}

function readFilesFromWorktree (base, startPath) {
  return fs
    .stat(base)
    .catch(() => {
      throw new Error(`the start path '${startPath}' does not exist`)
    })
    .then((stat) => {
      if (!stat.isDirectory()) throw new Error(`the start path '${startPath}' is not a directory`)
      return new Promise((resolve, reject) => {
        const opts = { base, cwd: base, removeBOM: false }
        vfs
          .src(CONTENT_GLOB, opts)
          .on('error', reject)
          .pipe(relativizeFiles())
          .pipe(collectFiles(resolve))
      })
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

async function readFilesFromGitTree (repository, ref, startPath) {
  return srcGitTree(await getGitTree(repository, ref, startPath))
}

async function getGitTree (repository, ref, startPath) {
  let commit
  if (ref.isTag()) {
    commit = await ref.peel(GIT_TYPE_COMMIT).then((target) => repository.getCommit(target))
  } else {
    commit = await repository.getBranchCommit(ref)
  }
  if (startPath) {
    const tree = await commit.getTree()
    const subTreeEntry = await tree.getEntry(startPath).catch((err) => {
      if (err.errno === git.Error.CODE.ENOTFOUND) err.message = `the start path '${startPath}' does not exist`
      throw err
    })
    if (!subTreeEntry.isDirectory()) throw new Error(`the start path '${startPath}' is not a directory`)
    return repository.getTree(subTreeEntry.id())
  } else {
    return commit.getTree()
  }
}

function srcGitTree (tree) {
  return new Promise((resolve, reject) => {
    const files = []
    // NOTE walk only visits blobs (i.e., files)
    tree
      .walk()
      .on('entry', (entry) => {
        // NOTE ignore dotfiles and extensionless files; convert remaining entries to File objects
        // NOTE since nodegit 0.21.2, tree walker always returns posix paths
        if (!DOT_OR_NOEXT_RX.test(entry.path())) files.push(entryToFile(entry))
      })
      .on('error', reject)
      .on('end', () => resolve(Promise.all(files)))
      .start()
  })
}

async function entryToFile (entry) {
  const blob = await entry.getBlob()
  const contents = blob.content()
  const stat = new fs.Stats()
  stat.mode = entry.filemode()
  stat.size = contents.length
  // NOTE since nodegit 0.21.2, tree walker always returns posix paths
  return new File({ path: entry.path(), contents, stat })
}

function loadComponentDescriptor (files, startPath) {
  const descriptorFileIdx = files.findIndex((file) => file.path === COMPONENT_DESC_FILENAME)
  if (descriptorFileIdx < 0) throw new Error(path.join(startPath, COMPONENT_DESC_FILENAME) + ' not found')
  const descriptorFile = files[descriptorFileIdx]
  files.splice(descriptorFileIdx, 1)
  const data = yaml.safeLoad(descriptorFile.contents.toString())
  if (data.name == null) {
    throw new Error(path.join(startPath, COMPONENT_DESC_FILENAME) + ' is missing a name')
  } else if (data.version == null) {
    throw new Error(path.join(startPath, COMPONENT_DESC_FILENAME) + ' is missing a version')
  }
  data.name = String(data.name)
  data.version = String(data.version)
  return data
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

// QUESTION should we create dedicate (mutable) instance of progress and set progress.label?
function getFetchOptions (progress, url, credentials, operation) {
  let authAttempted
  return {
    callbacks: {
      // https://github.com/nodegit/nodegit/blob/master/guides/cloning/ssh-with-agent/README.md#github-certificate-issue-in-os-x
      certificateCheck: () => 1,
      // NOTE nodegit will continue to make attempts until git.Cred.defaultNew() or undefined is returned
      credentials: (_, username) => {
        if (authAttempted) return process.platform === 'win32' ? undefined : git.Cred.defaultNew()
        authAttempted = true
        if (url.startsWith('https://') || url.startsWith('http://')) {
          return credentials
            ? git.Cred.userpassPlaintextNew(credentials.username, credentials.password)
            : git.Cred.usernameNew('')
        } else {
          // NOTE sshKeyFromAgent gracefully handles SSH agent not running
          return git.Cred.sshKeyFromAgent(username)
        }
      },
      transferProgress: progress.manager ? createTransferProgress(progress, url, operation) : undefined,
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

/**
 * Generates a safe, unique folder name for a git URL.
 *
 * The purpose of this function is generate a safe, unique folder name to use for the cloned
 * repository that gets stored in the cache.
 *
 * The generated folder name follows the pattern <basename>-<sha1>.git.
 *
 * @param {String} url - The repository URL to convert.
 * @returns {String} A safe, unique folder name.
 */
function generateCloneFolderName (url) {
  let normalizedUrl = url.toLowerCase()
  if (posixify) normalizedUrl = posixify(normalizedUrl)
  normalizedUrl = normalizedUrl.replace(NON_UNIQUE_URI_SUFFIX_RX, '')
  const basename = normalizedUrl.split(ANY_SEPARATOR_RX).pop()
  const sha1hash = createHash('sha1')
  sha1hash.update(normalizedUrl)
  const sha1 = sha1hash.digest('hex')
  return `${basename}-${sha1}.git`
}

/**
 * Resolve the URL of the specified remote for the given repository.
 *
 * @param {Repository} repo - The repository on which to operate.
 * @param {String} repoPath - The local filesystem path of the repository clone.
 * @param {String} remoteName - The name of the remote to resolve.
 * @returns {String} The URL of the specified remote, or the repository path if the
 * remote does not exist.
 */
async function resolveRemoteUrl (repo, repoPath, remoteName) {
  return (
    repo
      .getRemote(remoteName)
      .then((remote) => remote.url())
      // Q: should we turn this into a file URI?
      .catch(() => repoPath)
  )
}

/**
 * Checks whether the specified URL matches a directory on the local filesystem.
 *
 * @param {String} url - The URL to check.
 * @return {Boolean} A flag indicating whether the URL matches a directory on the local filesystem.
 */
function isLocalDirectory (url) {
  try {
    return fs.statSync(url).isDirectory()
  } catch (e) {
    return false
  }
}

/**
 * Expands the content cache directory path and ensures it exists.
 *
 * @param {String} preferredCacheDir - The preferred cache directory. If the value is undefined,
 *   the user's cache folder is used.
 * @param {String} startDir - The directory to use in place of a leading '.' segment.
 *
 * @returns {Promise<String>} A promise that resolves to the absolute content cache directory.
 */
function ensureCacheDir (preferredCacheDir, startDir) {
  // QUESTION should fallback directory be relative to cwd, playbook dir, or tmpdir?
  const baseCacheDir =
    preferredCacheDir == null
      ? getCacheDir('antora' + (process.env.NODE_ENV === 'test' ? '-test' : '')) || ospath.resolve('.antora/cache')
      : expandPath(preferredCacheDir, '~+', startDir)
  const cacheDir = ospath.join(baseCacheDir, CONTENT_CACHE_FOLDER)
  return fs.ensureDir(cacheDir).then(() => cacheDir)
}

module.exports = aggregateContent
module.exports._computeOrigin = computeOrigin
