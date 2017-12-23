'use strict'

const _ = require('lodash')
const del = require('del')
const File = require('vinyl')
const fs = require('fs-extra')
const git = require('nodegit')
const isMatch = require('matcher').isMatch
const map = require('map-stream')
const mimeTypes = require('./mime-types-with-asciidoc')
const path = require('path')
const streamToArray = require('stream-to-array')
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const { COMPONENT_DESC_FILENAME, CONTENT_CACHE_PATH } = require('./constants')
const EXT_RX = /\.[a-z]+$/
const URI_SCHEME_RX = /^[a-z]+:\/{0,2}/
const SEPARATOR_RX = /\/|:/

module.exports = async (playbook) => {
  const componentVersions = playbook.content.sources.map(async (source) => {
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
        let files
        if (isLocalRepo && !isBare && isHead) {
          files = await readFilesFromWorktree(path.join(source.url, source.startPath || ''))
        } else {
          files = await readFilesFromGitTree(repository, branch, source.startPath)
        }

        const componentVersion = await readComponentDesc(files)
        componentVersion.files = files.map((file) => assignFileProperties(file, url, branchName, source.startPath))
        return componentVersion
      })
      .value()

    const allRepoComponentVersions = await Promise.all(repoComponentVersions)

    // nodegit repositories need to be manually closed
    await repository.free()

    return allRepoComponentVersions
  })

  return buildAggregate(await Promise.all(componentVersions))
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
      del.sync(localPath)
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
    return fs.lstatSync(url).isDirectory()
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
  // NOTE we don't use extname since the last path segment could be .git
  const extMatch = url.includes('.') && url.match(EXT_RX)
  if (extMatch) {
    url = url.slice(0, -extMatch[0].length)
  }
  const schemeMatch = url.includes(':') && url.match(URI_SCHEME_RX)
  if (schemeMatch) {
    url = url.slice(schemeMatch[0].length)
  }
  if (url.startsWith('/')) {
    url = url.slice(1)
  }
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  const segments = url.split(SEPARATOR_RX)
  let firstSegment = segments[0]
  if (firstSegment.length === 0) {
    segments.splice(0, 1)
  } else {
    if (firstSegment.includes('@')) {
      firstSegment = firstSegment.slice(firstSegment.indexOf('@') + 1)
    }
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

function readComponentDesc (files) {
  const componentDescFile = files.find((file) => file.path === COMPONENT_DESC_FILENAME)
  if (componentDescFile == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' not found')
  }

  const componentDesc = yaml.safeLoad(componentDescFile.contents.toString())
  if (componentDesc.name == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' is missing a name')
  }
  if (componentDesc.version == null) {
    throw new Error(COMPONENT_DESC_FILENAME + ' is missing a version')
  }

  return componentDesc
}

async function readFilesFromGitTree (repository, branch, startPath) {
  const tree = await getGitTree(repository, branch, startPath)
  const entries = await walkGitTree(tree)
  const files = entries.map(async (entry) => {
    const blob = await entry.getBlob()
    const contents = blob.content()
    const stat = new fs.Stats({})
    stat.mode = entry.filemode()
    stat.size = contents.length
    return new File({ path: entry.path(), contents, stat })
  })
  return Promise.all(files)
}

async function getGitTree (repository, branch, startPath) {
  const commit = await repository.getBranchCommit(branch)
  const tree = await commit.getTree()
  if (startPath == null) {
    return tree
  }
  const subEntry = await tree.entryByPath(startPath)
  const subTree = await repository.getTree(subEntry.id())
  return subTree
}

function walkGitTree (tree) {
  return new Promise((resolve, reject) => {
    const walker = tree.walk()
    walker.on('error', (e) => reject(e))
    walker.on('end', (entries) => resolve(entries))
    walker.start()
  })
}

async function readFilesFromWorktree (relativeDir) {
  const base = path.resolve(relativeDir)
  const opts = { base, cwd: base }
  // NOTE streamToArray wraps the stream in a Promise so it can be awaited
  return streamToArray(vfs.src('**/*.*', opts).pipe(relativize()))
}

/**
 * Transforms all files in stream to a component root relative path.
 *
 * Applies a mapping function to all vinyl files in the stream so they end up
 * with a path relative to the component root instead of the file system.
 */
function relativize () {
  return map((file, next) => {
    next(
      null,
      new File({
        path: file.relative,
        contents: file.contents,
        stat: file.stat,
        src: { abspath: file.path },
      })
    )
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
