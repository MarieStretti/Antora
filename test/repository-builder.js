'use strict'

const fs = require('fs-extra')
const git = require('nodegit')
const ospath = require('path')
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

const FS = '/'
const RS = '\\'
const RS_RX = /\\/g

class RepositoryBuilder {
  constructor (repoBase, fixtureBase, opts = {}) {
    if (!ospath.isAbsolute(repoBase)) {
      throw new Error('repoBase argument must be an absolute path')
    }
    if (!ospath.isAbsolute(fixtureBase)) {
      throw new Error('fixtureBase argument must be an absolute path')
    }
    this.repoBase = repoBase
    this.fixtureBase = fixtureBase
    this.remote = opts.remote
    this.bare = opts.bare
  }

  async open (repoName) {
    if (repoName) {
      this.repoPath = ospath.join(this.repoBase, repoName)
    } else if (!this.repoPath) {
      throw new Error('No repository name specified and no previous repository was opened by this builder.')
    }
    this.repository = await git.Repository.open(this.repoPath)
    return this
  }

  async init (repoName = 'test-repo') {
    this.url = this.repoPath = ospath.join(this.repoBase, repoName)
    if (this.remote) {
      this.url = 'file://' + (ospath.sep === RS ? FS + this.url.replace(RS_RX, FS) : this.url)
      if (this.bare) this.url += FS + '.git'
    } else if (this.bare) this.url += ospath.sep + '.git'
    // WARNING nodegit fails to create repository path on Windows if path contains backslashes (nodegit#1431)
    await fs.ensureDir(this.repoPath)
    this.repository = await git.Repository.init(this.repoPath, 0)
    await this.addToWorktree('.gitignore')
    return this.commitAll()
  }

  async checkoutBranch (branchName) {
    let branchRef
    try {
      branchRef = await this.repository.getBranch(branchName)
    } catch (e) {
      const headCommit = await this.repository.getHeadCommit()
      branchRef = await this.repository.createBranch(branchName, headCommit, 0)
    }
    await this.repository.checkoutBranch(branchRef)
    return this
  }

  async addComponentDescriptorToWorktree (data) {
    const path_ = (this.startPath = data.startPath || '') ? ospath.join(this.startPath, 'antora.yml') : 'antora.yml'
    delete data.startPath
    if (data.name && !data.title) {
      data.title = data.name
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.substr(1))
        .join(' ')
    }
    return this.addToWorktree(path_, yaml.safeDump(data))
  }

  async addComponentDescriptor (data) {
    return this.addComponentDescriptorToWorktree(data).then(() => this.commitAll('add component descriptor'))
  }

  async addToWorktree (path_, contents = '') {
    return new Promise((resolve, reject) => {
      const to = ospath.join(this.repoPath, path_)
      const toDir = ospath.dirname(to)
      const ensureDir = toDir === this.repoPath ? Promise.resolve() : fs.ensureDir(toDir)
      ensureDir.then(() => fs.writeFile(to, contents, (err) => (err ? reject(err) : resolve(this))))
    })
  }

  async importFilesFromFixture (fixtureName = '', opts = {}) {
    return new Promise((resolve) => {
      const exclude = opts.exclude && opts.exclude.map((path_) => ospath.normalize(path_))
      const paths = []
      vfs
        .src('**/*.*', { cwd: ospath.join(this.fixtureBase, fixtureName), cwdbase: true, read: false })
        .on('data', (file) => (exclude && exclude.includes(file.relative) ? null : paths.push(file.relative)))
        .on('end', async () => resolve(this.addFilesFromFixture(paths, fixtureName)))
    })
  }

  async addFilesFromFixture (paths, fixtureName = '', toStartPath = true) {
    if (!Array.isArray(paths)) paths = [paths]
    if (toStartPath && this.startPath) paths = paths.map((path_) => ospath.join(this.startPath, path_))
    await this.copyToWorktree(paths, ospath.join(this.fixtureBase, fixtureName))
    return this.commitAll('add fixtures')
  }

  async copyToWorktree (paths, fromBase) {
    return Promise.all(
      paths.map((path_) => {
        const to = ospath.join(this.repoPath, path_)
        // NOTE copy fixture file if exists, otherwise create an empty file
        return fs
          .ensureDir(ospath.dirname(to))
          .then(() => fs.copy(ospath.join(fromBase, path_), to).catch(() => fs.writeFile(to, '')))
      })
    ).then(() => this)
  }

  async removeFromWorktree (paths) {
    if (!Array.isArray(paths)) paths = [paths]
    return Promise.all(paths.map((path_) => fs.remove(ospath.join(this.repoPath, path_)))).then(() => this)
  }

  async commitAll (message = 'make it so') {
    const repo = this.repository
    const author = git.Signature.now('Doc Writer', 'doc.writer@example.com')
    const index = await repo.refreshIndex()
    await index.addAll()
    await index.write()
    const treeOid = await index.writeTree()
    const parentCommit = await repo.getHeadCommit()
    await repo.createCommit('HEAD', author, author, message, treeOid, parentCommit === null ? null : [parentCommit])
    return this
  }

  async createTag (name, refname = 'HEAD') {
    const ref = await this.repository.getReference(refname)
    await this.repository.createTag(ref.target(), name, name)
    return this
  }

  async addRemote (name, url, fetch = true) {
    const remote = await git.Remote.create(this.repository, name, url)
    if (fetch) await this.repository.fetch(remote)
    return this
  }

  async close (branchName = undefined) {
    if (branchName) await this.checkoutBranch(branchName)
    this.repository.free()
    this.repository = undefined
    return this
  }
}

module.exports = RepositoryBuilder
