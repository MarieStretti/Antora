'use strict'

const path = require('path')
const git = require('nodegit')
const fs = require('fs-extra')

const fixturesPath = path.resolve(__dirname, 'fixtures')
const reposBasePath = path.resolve(__dirname, 'repos')

class FixtureRepo {
  constructor ({ isRemote, isBare }) {
    this.isRemote = isRemote
    this.isBare = isBare
  }

  async initRepo ({ repoName, name, title, version, nav, subpath }) {
    this.subpath = subpath
    this.repoPath = path.join(reposBasePath, repoName || name || 'default-repo')
    this.location = this.repoPath
    if (this.isRemote) {
      this.location = 'file://' + this.location
    }
    if (this.isBare) {
      this.location = this.location + '/.git'
    }
    this.repository = await git.Repository.init(this.repoPath, 0)
    await this.copyAll(['README.adoc'])
    await this.commitAll('Init commit', true)
    await this.setDocsComponent({ name, title, version, nav, subpath })
    return this
  }

  async copyAll (items, subpath = '.') {
    return Promise.all(
      items.map((item) => fs.copy(path.join(fixturesPath, item), path.join(this.repoPath, subpath, item)))
    )
  }

  async removeAll (items) {
    return Promise.all(items.map((item) => fs.remove(path.join(this.repoPath, item))))
  }

  async commitAll (message, firstCommit = false) {
    const index = await this.repository.refreshIndex()
    await index.addAll()
    await index.write()
    const oid = await index.writeTree()
    const parentCommits = []

    if (!firstCommit) {
      const head = await git.Reference.nameToId(this.repository, 'HEAD')
      const commit = await this.repository.getCommit(head)
      parentCommits.push(commit)
    }

    return this.repository.createCommit(
      'HEAD',
      git.Signature.create('John Smith', 'john@smith.com', 123456789, 60),
      git.Signature.create('John Smith', 'john@smith.com', 987654321, 90),
      message,
      oid,
      parentCommits
    )
  }

  async setDocsComponent ({ name, title, version, nav, subpath = '.' }) {
    const filepath = path.join(this.repoPath, subpath, 'docs-component.yml')
    const docsComponentYml = []
    if (name) {
      docsComponentYml.push(`name: ${name}`)
    }
    if (title) {
      docsComponentYml.push(`title: ${title}`)
    }
    if (version) {
      docsComponentYml.push(`version: '${version}'`)
    }
    if (nav) {
      docsComponentYml.push('nav:')
      nav.forEach((navItem) => {
        docsComponentYml.push(`  - ${navItem}`)
      })
    }
    if (name != null || version != null) {
      await fs.ensureFile(filepath)
      await fs.writeFile(filepath, docsComponentYml.join('\n'))
      await this.commitAll(`Set docs-component for ${version}`)
    }
  }

  async createBranch ({ name, version, branch }) {
    const branchName = branch || version
    const head = await git.Reference.nameToId(this.repository, 'HEAD')
    const commit = await this.repository.getCommit(head)
    const branchReference = await this.repository.createBranch(branchName, commit, 0)
    await this.repository.checkoutBranch(branchReference)
    await this.setDocsComponent({ name, version })
  }

  async addFixtureFiles (files, subpath) {
    await this.copyAll(files, subpath)
    await this.commitAll('Add example files')
  }

  async removeFixtureFiles (files) {
    await this.removeAll(files)
    await this.commitAll('Remove example files')
  }
}

module.exports = FixtureRepo
