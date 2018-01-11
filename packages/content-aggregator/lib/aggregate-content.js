'use strict'

const _ = require('lodash')
const collect = require('stream-to-array')
const File = require('vinyl')
const fs = require('fs-extra')
const git = require('nodegit')
const isMatch = require('matcher').isMatch
const map = require('through2').obj
const mimeTypes = require('./mime-types-with-asciidoc')
const path = require('path')
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const { COMPONENT_DESC_FILENAME, CONTENT_CACHE_PATH, CONTENT_GLOB } = require('./constants')
const DOT_OR_NOEXT_RX = new RegExp('(?:^|/)(?:\\.|[^/.]+$)')
const SEPARATOR_RX = /\/|:/
const URI_SCHEME_RX = /^[a-z]+:\/{0,2}/

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
 * @param {Array} playbook.content - An array of content sources.
 *
 * @returns {Object} A map of files organized by component version.
 */
async function aggregateContent (playbook) {
  const componentVersions = await Promise.all(
    playbook.content.sources.map(async (source) => {
      const { repository, isLocalRepo, isBare, url } = await openOrCloneRepository(source.url)
      const branches = await repository.getReferences(git.Reference.TYPE.OID)

      const repoComponentVersions = _(branches)
        .map((branch) => getBranchInfo(branch))
        .groupBy('branchName')
        .mapValues((unorderedBranches) => {
          // isLocal comes from reference.isBranch() which is 0 or 1
          // so we'll end up with truthy isLocal last in the array
          const branches = _.sortBy(unorderedBranches, 'isLocal')
          return isLocalRepo ? _.last(branches) : _.first(branches)
        })
        .values()
        .filter(({ branchName }) => branchMatches(branchName, source.branches || playbook.content.branches))
        .map(async ({ branch, branchName, isHead, isLocal }) => {
          let filesPromise
          if (isLocalRepo && !isBare && isHead) {
            filesPromise = readFilesFromWorktree(path.join(source.url, source.startPath || ''))
          } else {
            filesPromise = readFilesFromGitTree(repository, branch, source.startPath)
          }

          return filesPromise.then((files) => {
            const componentVersion = loadComponentDescriptor(files)
            componentVersion.files = files.map((file) => assignFileProperties(file, url, branchName, source.startPath))
            return componentVersion
          })
        })
        .value()

      return Promise.all(repoComponentVersions).then((value) => {
        // nodegit repositories need to be manually closed
        repository.free()
        return value
      })
    })
  )

  return buildAggregate(componentVersions)
}

async function openOrCloneRepository (repoUrl) {
  const isLocalRepo = isLocalDirectory(repoUrl)

  let localPath
  let repository
  let isBare

  if (isLocalRepo) {
    localPath = repoUrl
    isBare = !isLocalDirectory(path.join(localPath, '.git'))
  } else {
    localPath = path.join(getCacheDir(), generateLocalFolderName(repoUrl))
    isBare = true
  }

  try {
    if (isBare) {
      repository = await git.Repository.openBare(localPath)
      if (!isLocalRepo) {
        // fetches new branches and deletes old local ones
        await repository.fetch('origin', Object.assign({ prune: 1 }, getFetchOptions()))
      }
    } else {
      repository = await git.Repository.open(localPath)
    }
  } catch (e) {
    if (!isLocalRepo) {
      fs.removeSync(localPath)
      repository = await git.Clone.clone(repoUrl, localPath, {
        bare: 1,
        fetchOpts: getFetchOptions(),
      })
    }
  }

  let url
  try {
    const remoteObject = await repository.getRemote('origin')
    url = remoteObject.url()
  } catch (e) {
    url = repoUrl
  }

  return { repository, isLocalRepo, isBare, url }
}

/**
 * Checks whether the specified URL resolves to a directory on the local filesystem.
 *
 * @param {String} url - The URL to check.
 * @return {Boolean} - A flag indicating whether the URL resolves to a directory on the local filesystem.
 */
function isLocalDirectory (url) {
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
  const cacheAbsPath = path.resolve(CONTENT_CACHE_PATH)
  fs.ensureDirSync(cacheAbsPath)
  return cacheAbsPath
}

/**
 * Generates a friendly folder name from a URL.
 *
 * - Remove extension (e.g., .git)
 * - Remove URI scheme (e.g,. https://)
 * - Remove user from host (e.g., git@)
 * - Remove leading and trailing slashes
 * - Replace / and : with %
 *
 * @param {String} url - The repository URL to convert.
 * @return {String} - A friendly folder name.
 */
function generateLocalFolderName (url) {
  // NOTE we don't check extname since the last path segment could equal .git
  if (url.endsWith('.git')) url = url.substr(0, url.length - 4)
  const schemeMatch = ~url.indexOf(':') && url.match(URI_SCHEME_RX)
  if (schemeMatch) url = url.substr(schemeMatch[0].length)
  if (url.charAt() === '/') url = url.substr(1)
  const lastIdx = url.length - 1
  if (url.charAt(lastIdx) === '/') url = url.substr(0, lastIdx)
  const segments = url.split(SEPARATOR_RX)
  let firstSegment = segments[0]
  if (firstSegment.length === 0) {
    segments.splice(0, 1)
  } else {
    const atIdx = firstSegment.indexOf('@')
    if (~atIdx) firstSegment = firstSegment.substr(atIdx + 1)
    segments[0] = firstSegment
  }
  return segments.join('%')
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

function getBranchInfo (branch) {
  const branchName = branch.shorthand().replace(/^origin\//, '')
  const isLocal = branch.isBranch() === 1
  const isHead = branch.isHead() === 1
  return { branch, branchName, isLocal, isHead }
}

function branchMatches (branchName, branchPattern) {
  if (Array.isArray(branchPattern)) {
    return branchPattern.some((pattern) => isMatch(branchName, pattern))
  }
  return isMatch(branchName, branchPattern)
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

async function readFilesFromGitTree (repository, branch, startPath) {
  return srcGitTree(await getGitTree(repository, branch, startPath))
}

async function getGitTree (repository, branch, startPath) {
  const commit = await repository.getBranchCommit(branch)
  if (startPath) {
    const tree = await commit.getTree()
    const subTreeEntry = await tree.entryByPath(startPath)
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
    walker.on('error', (err) => reject(err))
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
  return new File({ path: entry.path(), contents, stat })
}

function readFilesFromWorktree (relativeDir) {
  const base = path.resolve(relativeDir)
  const opts = { base, cwd: base, removeBOM: false }
  // NOTE collect wraps the stream in a Promise so it can be awaited
  return collect(vfs.src(CONTENT_GLOB, opts).pipe(relativize()))
}

/**
 * Transforms all files in stream to a component root relative path.
 *
 * Applies a mapping function to all vinyl files in the stream so they end up
 * with a path relative to the component root instead of the file system.
 * This mapper also filters out any directories that got caught in the glob.
 */
function relativize () {
  return map((file, encoding, next) => {
    const { contents, stat } = file
    // NOTE if contents is null, the file is either a directory or it couldn't be read
    if (contents === null) {
      next()
    } else {
      next(
        null,
        new File({
          path: file.relative,
          contents,
          stat,
          src: { abspath: file.path },
        })
      )
    }
  })
}

function assignFileProperties (file, url, branch, startPath = '/') {
  Object.defineProperty(file, 'relative', {
    get: function () {
      return this.path
    },
  })

  const extname = file.extname
  file.mediaType = mimeTypes.lookup(extname)
  file.src = Object.assign(file.src || {}, {
    path: file.path,
    basename: file.basename,
    stem: file.stem,
    extname,
    mediaType: file.mediaType,
    origin: {
      git: { url, branch, startPath },
    },
  })

  return file
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
