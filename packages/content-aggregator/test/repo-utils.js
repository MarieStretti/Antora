'use strict'

const fs = require('fs-extra')
const git = require('nodegit')
const path = require('path')

const { COMPONENT_DESC_FILENAME } = require('@antora/content-aggregator/lib/constants')
const fixturesPath = path.resolve(__dirname, 'fixtures')
const reposBasePath = path.resolve(__dirname, 'repos')

class FixtureRepo {
  constructor ({ isRemote, isBare }) {
    this.isRemote = isRemote
    this.isBare = isBare
  }

  async initRepo ({ repoName, name, title, version, nav, startPath }) {
    this.startPath = startPath
    this.repoPath = path.join(reposBasePath, repoName || name || 'default-repo')
    this.url = this.repoPath
    if (this.isRemote) {
      this.url = 'file://' + this.url
    }
    if (this.isBare) {
      this.url = this.url + '/.git'
    }
    this.repository = await git.Repository.init(this.repoPath, 0)
    await this.copyAll(['README.adoc'])
    await this.commitAll('Init commit', true)
    await this.setDocsComponent({ name, title, version, nav, startPath })
    return this
  }

  async copyAll (items, startPath = '.') {
    return Promise.all(
      items.map((item) => {
        const to = path.join(this.repoPath, startPath, item)
        // copy fixture file if exists, otherwise create an empty file
        return fs
          .ensureDir(path.dirname(to))
          .then(() => fs.copy(path.join(fixturesPath, item), to).catch(() => fs.writeFile(to, '', 'utf8')))
      })
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

  async setDocsComponent ({ name, title, version, nav, startPath = '.' }) {
    const filepath = path.join(this.repoPath, startPath, COMPONENT_DESC_FILENAME)
    const componentDescYaml = []
    if (name) {
      componentDescYaml.push(`name: ${name}`)
    }
    if (title) {
      componentDescYaml.push(`title: ${title}`)
    }
    if (version) {
      componentDescYaml.push(`version: '${version}'`)
    }
    if (nav) {
      componentDescYaml.push('nav:')
      nav.forEach((navItem) => {
        componentDescYaml.push(`  - ${navItem}`)
      })
    }
    if (name != null || version != null) {
      await fs.ensureFile(filepath)
      await fs.writeFile(filepath, componentDescYaml.join('\n'))
      await this.commitAll(`Populate component desc for ${version}`)
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

  async addFixtureFiles (files, startPath) {
    await this.copyAll(files, startPath)
    await this.commitAll('Add example files')
  }

  async removeFixtureFiles (files) {
    await this.removeAll(files)
    await this.commitAll('Remove example files')
  }
}

module.exports = FixtureRepo
