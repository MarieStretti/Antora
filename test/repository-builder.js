'use strict'

const fs = require('fs-extra')
const git = require('nodegit')
const path = require('path')
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

class RepositoryBuilder {
  constructor (repoBase, fixtureBase) {
    this.repoBase = repoBase
    this.fixtureBase = fixtureBase
  }

  async open (repoName = 'test-repo') {
    this.repository = await git.Repository.open((this.repoPath = path.join(this.repoBase, repoName)))
    return this
  }

  async init (repoName = 'test-repo') {
    this.repository = await git.Repository.init((this.repoPath = path.join(this.repoBase, repoName)), 0)
    this.addToWorktree('.gitignore')
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

  addComponentDescriptorToWorktree (data) {
    if (!data.title) {
      data.title = data.name
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.substr(1))
        .join(' ')
    }
    return this.addToWorktree('antora.yml', yaml.safeDump(data))
  }

  addToWorktree (path_, contents = '') {
    fs.writeFileSync(path.join(this.repoPath, path_), contents)
    return this
  }

  async importFilesFromFixture (fixtureName = '', opts = {}) {
    return new Promise((resolve) => {
      const exclude = opts.exclude
      const paths = []
      vfs
        .src('**/*.*', { cwd: path.join(this.fixtureBase, fixtureName), cwdbase: true, read: false })
        .on('data', (file) => (exclude && exclude.includes(file.relative) ? null : paths.push(file.relative)))
        .on('end', async () => resolve(this.addFilesFromFixture(paths, fixtureName)))
    })
  }

  async addFilesFromFixture (paths, fixtureName = '') {
    await this.copyToWorktree(paths, path.join(this.fixtureBase, fixtureName))
    return this.commitAll('add fixtures')
  }

  async copyToWorktree (paths, fromBase) {
    return Promise.all(
      paths.map((path_) => {
        const to = path.join(this.repoPath, path_)
        // copy fixture file if exists, otherwise create an empty file
        return fs
          .ensureDir(path.dirname(to))
          .then(() => fs.copy(path.join(fromBase, path_), to).catch(() => fs.writeFile(to, '')))
      })
    ).then(() => this)
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

  async close (branchName = undefined) {
    if (branchName) await this.checkoutBranch(branchName)
    this.repository.free()
    this.repository = undefined
    return this
  }
}

module.exports = RepositoryBuilder
