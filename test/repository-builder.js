'use strict'

const fs = require('fs-extra')
const git = require('isomorphic-git')
const ospath = require('path')
const vfs = require('vinyl-fs')
const yaml = require('js-yaml')

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
    if ((this.remote = !!opts.remote)) this.gitServerPort = opts.remote.gitServerPort || 60617
    this.bare = opts.bare
    this.author = { name: 'Doc Writer', email: 'doc.writer@example.com' }
  }

  async init (repoName = 'test-repo') {
    this.url = this.repoPath = ospath.join(this.repoBase, repoName)
    if (this.remote) {
      // NOTE node-git-server requires path to end with file extension if present in URL (which isomorphic-git adds)
      this.repoPath += '.git'
      this.url = `http://localhost:${this.gitServerPort}/${repoName}.git${this.bare ? '/.git' : ''}`
    } else if (this.bare) this.url += ospath.sep + '.git'
    this.repository = { fs, dir: this.repoPath, gitdir: ospath.join(this.repoPath, '.git') }
    await git.init(this.repository)
    await this.addToWorktree('.gitattributes', '* text=auto eol=lf')
    await this.addToWorktree('.gitignore')
    // NOTE isomorphic-git requires at least one commit to set up refs/heads/master (required to use statusMatrix)
    await git.commit({ ...this.repository, author: this.author, message: 'init' })
    return this.commitAll()
  }

  async open (repoName = undefined) {
    let dir
    let gitdir
    if (repoName) {
      this.repoPath = dir = ospath.join(this.repoBase, repoName)
      gitdir = ospath.join(dir, '.git')
      if (
        this.bare &&
        !(await fs
          .stat(gitdir)
          .then((stat) => stat.isDirectory())
          .catch(() => false))
      ) {
        gitdir = dir
      }
    } else {
      if (!(dir = this.repoPath)) {
        throw new Error('No repository name specified and no previous repository was opened by this builder.')
      }
      gitdir = ospath.join(dir, '.git')
    }
    this.repository = { fs, dir, gitdir }
    await git.resolveRef({ ...this.repository, ref: 'HEAD', depth: 1 })
    return this
  }

  async clone (clonePath) {
    return git.clone({ fs, dir: clonePath, url: this.url })
  }

  async checkoutBranch (branchName) {
    await git
      .branch({ ...this.repository, ref: branchName, checkout: true })
      .catch(() => git.checkout({ ...this.repository, ref: branchName, remote: 'NO_SUCH_REMOTE' }))
    return this
  }

  async checkoutBranch$1 (branchName, ref = 'HEAD') {
    const oid = await git.resolveRef({ ...this.repository, ref })
    await fs.writeFile(ospath.join(this.repository.gitdir, `refs/heads/${branchName}`), oid + '\n')
    await fs.writeFile(ospath.join(this.repository.gitdir, 'HEAD'), `ref: refs/heads/${branchName}\n`)
    return this
  }

  async deleteBranch (branchName) {
    await git.deleteBranch({ ...this.repository, ref: branchName }).catch(() => {})
    return this
  }

  async addComponentDescriptorToWorktree (data) {
    const startPath = (this.startPath = data.startPath || '')
    const path_ = startPath ? ospath.join(startPath, 'antora.yml') : 'antora.yml'
    delete data.startPath
    if (!data.title && typeof data.name === 'string') {
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
    // NOTE emulates addAll
    await git.statusMatrix(repo).then((status) =>
      Promise.all(
        status.map(([filepath, _, worktreeStatus]) =>
          // NOTE sometimes isomorphic-git reports a changed file as unmodified, so always add if not removing
          worktreeStatus === 0 ? git.remove({ ...repo, filepath }) : git.add({ ...repo, filepath })
        )
      )
    )
    await git.commit({ ...repo, author: this.author, message })
    return this
  }

  async createTag (name, ref = 'HEAD') {
    const now = new Date()
    await git
      .resolveRef({ ...this.repository, ref })
      .then((commitOid) =>
        git.writeObject({
          ...this.repository,
          type: 'tag',
          object: {
            object: commitOid,
            type: 'commit',
            tag: name,
            tagger: { ...this.author, timestamp: Math.floor(+now / 1000), timezoneOffset: now.getTimezoneOffset() },
            message: name,
            signature: '',
          },
        })
      )
      .then((tagOid) => {
        const tagFile = ospath.join(this.repository.gitdir, 'refs', 'tags', name)
        return fs.ensureDir(ospath.dirname(tagFile)).then(() => fs.writeFile(tagFile, tagOid + '\n'))
      })
    return this
  }

  async addRemote (name, url, fetch = true) {
    await git.addRemote({ ...this.repository, remote: name, url })
    if (fetch) await git.fetch({ ...this.repository, remote: name })
    return this
  }

  async detachHead (oid = undefined) {
    if (!oid) oid = await git.resolveRef({ ...this.repository, ref: 'HEAD' })
    await git.checkout({ ...this.repository, ref: oid })
    // NOTE workaround bug in isomorphic-git when checking out a commit
    await fs.writeFile(ospath.join(this.repository.gitdir, 'HEAD'), oid + '\n')
    return this
  }

  async findEntry (filepath, ref = 'HEAD') {
    return git.listFiles({ ...this.repository, ref }).then((files) => files.find((candidate) => candidate === filepath))
  }

  async close (branchName = undefined) {
    if (branchName) await git.checkout({ ...this.repository, ref: branchName })
    this.repository = undefined
    return this
  }
}

module.exports = RepositoryBuilder
