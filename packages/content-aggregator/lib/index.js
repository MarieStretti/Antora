'use strict'

const _ = require('lodash')
const del = require('del')
const File = require('vinyl')
const fs = require('fs')
const git = require('nodegit')
const isMatch = require('matcher').isMatch
const mimeTypes = require('./mime-types-with-asciidoc')
const path = require('path')
const streamToArray = require('stream-to-array')
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const { COMPONENT_DESC_FILENAME } = require('./constants')
const localCachePath = path.resolve('.git-cache')

module.exports = async (playbook) => {
  const componentVersions = playbook.content.sources.map(async (repo) => {
    const { repository, isLocalRepo, isBare, url } = await openOrCloneRepository(repo.url)
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
      .filter(({ branchName }) => branchMatches(branchName, repo.branches || playbook.content.branches))
      .map(async ({ branch, branchName, isHead, isLocal }) => {
        let files
        if (isLocalRepo && !isBare && isHead) {
          files = await loadLocalFiles(repo)
        } else {
          files = await loadGitFiles(repository, branch, repo)
        }

        const componentVersion = await readComponentDesc(files)
        componentVersion.files = files.map((file) => assignFileProperties(file, url, branchName, repo.startPath))
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
    localPath = localCachePath + '/' + repoUrl.replace(/[:/\\]+/g, '__')
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

function isLocalDirectory (repoUrl) {
  try {
    const stats = fs.lstatSync(repoUrl)
    return stats.isDirectory()
  } catch (e) {
    return false
  }
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
  const componentDescFile = files.find((file) => file.relative === COMPONENT_DESC_FILENAME)
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

async function loadGitFiles (repository, branch, repo) {
  const tree = await getGitTree(repository, branch, repo.startPath)
  const entries = await getGitEntries(tree)
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

function getGitEntries (tree, onEntry) {
  return new Promise((resolve, reject) => {
    const walker = tree.walk()
    walker.on('error', (e) => reject(e))
    walker.on('end', (entries) => resolve(entries))
    walker.start()
  })
}

async function loadLocalFiles (repo) {
  const basePath = path.join(repo.url, repo.startPath || '.')
  return streamToArray(vfs.src('**/*.*', {
    base: basePath,
    cwd: basePath,
    dot: false,
  }))
}

function assignFileProperties (file, url, branch, startPath = '/') {
  file.path = file.relative
  file.base = process.cwd()
  file.cwd = process.cwd()

  const extname = path.extname(file.path)
  file.src = {
    basename: path.basename(file.path),
    mediaType: mimeTypes.lookup(extname),
    stem: path.basename(file.path, extname),
    extname,
    origin: {
      git: { url, branch, startPath },
    },
  }
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
