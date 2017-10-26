/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')
const aggregateContent = require('../lib/index')
const FixtureRepo = require('./repo-utils')

const path = require('path')

const _ = require('lodash')
const del = require('del')

function testAll (testFunction, count = 1) {
  function test (fixtureRepoOptions) {
    const repos = Array.from({ length: count }).map(() => new FixtureRepo(fixtureRepoOptions))
    return testFunction(...repos)
  }

  it('on local repo', () => test({ isRemote: false, isBare: false }))
  it('on local bare repo', () => test({ isRemote: false, isBare: true }))
  it('on remote repo', () => test({ isRemote: true, isBare: false }))
  it('on remote bare repo', () => test({ isRemote: true, isBare: true }))
}

function cleanRepos () {
  del.sync('.git-cache')
  del.sync(path.resolve(__dirname, 'repos', '*'), { dot: true })
}

describe('aggregateContent()', () => {
  let playbook

  beforeEach(() => {
    cleanRepos()
    playbook = {
      content: {
        sources: [],
        branches: ['v*', 'master'],
      },
    }
  })

  afterEach(cleanRepos)

  // Read & validate docs-component.yml

  describe('should throw if docs-component.yml cannot be found', () => {
    testAll(async (repo) => {
      await repo.initRepo({})
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus).to.be.rejectedWith('docs-component.yml not found')
    })
  })

  describe('should throw if docs-component.yml does not define a name', () => {
    testAll(async (repo) => {
      await repo.initRepo({ version: 'v1.0.0' })
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus).to.be.rejectedWith('docs-component.yml is missing a name')
    })
  })

  describe('should throw if docs-component.yml does not define a version', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component' })
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus).to.be.rejectedWith('docs-component.yml is missing a version')
    })
  })

  describe('should read properties from docs-component.yml', () => {
    testAll(async (repo) => {
      await repo.initRepo({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        nav: ['nav-one.adoc', 'nav-two.adoc'],
      })
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({
            name: 'the-component',
            title: 'The Component',
            version: 'v1.2.3',
            nav: ['nav-one.adoc', 'nav-two.adoc'],
          })
        })
    })
  })

  describe('should read properties from docs-component.yml located at specified startPath', () => {
    testAll(async (repo) => {
      await repo.initRepo({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        nav: ['nav-one.adoc', 'nav-two.adoc'],
        startPath: 'docs',
      })
      playbook.content.sources.push({
        location: repo.location,
        startPath: repo.startPath,
      })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({
            name: 'the-component',
            title: 'The Component',
            version: 'v1.2.3',
            nav: ['nav-one.adoc', 'nav-two.adoc'],
          })
        })
    })
  })

  describe('should discover components across multiple repositories', () => {
    testAll(async (theComponent, theOtherComponent) => {
      await theComponent.initRepo({ name: 'the-component', title: 'The Component', version: 'v1.2.3' })
      playbook.content.sources.push({ location: theComponent.location })
      await theOtherComponent.initRepo({ name: 'the-other-component', title: 'The Other Component', version: 'v4.5.6' })
      playbook.content.sources.push({ location: theOtherComponent.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(2)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', title: 'The Component', version: 'v1.2.3' })
          expect(theCorpus[1]).to.deep.include({
            name: 'the-other-component',
            title: 'The Other Component',
            version: 'v4.5.6',
          })
        })
    }, 2)
  })

  // Filter branches

  async function initRepoWithBranches (repo) {
    await repo.initRepo({ name: 'the-component', version: 'unknown' })
    await repo.createBranch({ name: 'the-component', version: 'v1.0.0' })
    await repo.createBranch({ name: 'the-component', version: 'v2.0.0' })
    await repo.createBranch({ name: 'the-component', version: 'v3.0.0' })
  }

  describe('should filter branches by exact name', () => {
    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({
        location: repo.location,
        branches: 'master',
      })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'unknown' })
        })
    })
  })

  describe('should filter branches using wildcard', () => {
    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({
        location: repo.location,
        branches: 'v*',
      })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(3)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
          expect(theCorpus[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
          expect(theCorpus[2]).to.deep.include({ name: 'the-component', version: 'v3.0.0' })
        })
    })
  })

  describe('should filter branches using multiple filters', () => {
    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({
        location: repo.location,
        branches: ['master', 'v1.*', 'v3.*'],
      })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(3)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'unknown' })
          expect(theCorpus[1]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
          expect(theCorpus[2]).to.deep.include({ name: 'the-component', version: 'v3.0.0' })
        })
    })
  })

  describe('should filter branches using playbook default filter "content.branches"', () => {
    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({ location: repo.location })
      playbook.content.branches = ['v1.0.0', 'v2*']
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(2)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
          expect(theCorpus[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
        })
    })

    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({ location: repo.location })
      playbook.content.branches = 'v1.0.*'
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
        })
    })
  })

  async function initRepoWithFiles (repo) {
    await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
    await repo.addFixtureFiles([
      'modules/ROOT/_attributes.adoc',
      'modules/ROOT/content/_attributes.adoc',
      'modules/ROOT/content/page-one.adoc',
      'modules/ROOT/content/page-two.adoc',
      'modules/ROOT/content/topic-a/page-three.adoc',
    ])
  }

  // Catalog all files

  describe('should catalog all files', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({
            name: 'the-component',
            version: 'v1.2.3',
          })
          expect(theCorpus[0].files).to.have.lengthOf(7)
          expect(theCorpus[0].files[0].path).to.equal('README.adoc')
          expect(theCorpus[0].files[1].path).to.equal('docs-component.yml')
          expect(theCorpus[0].files[2].path).to.equal('modules/ROOT/_attributes.adoc')
          expect(theCorpus[0].files[3].path).to.equal('modules/ROOT/content/_attributes.adoc')
          expect(theCorpus[0].files[4].path).to.equal('modules/ROOT/content/page-one.adoc')
          expect(theCorpus[0].files[5].path).to.equal('modules/ROOT/content/page-two.adoc')
          expect(theCorpus[0].files[6].path).to.equal('modules/ROOT/content/topic-a/page-three.adoc')
        })
    })
  })

  describe('should populate files with correct contents', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-one.adoc' })
          expect(pageOne.contents.toString()).to.equal(
            [
              '= Page One',
              'ifndef::env-site,env-github[]',
              'include::_attributes.adoc[]',
              'endif::[]',
              ':keywords: foo, bar',
              '',
              'Hey World!',
              '',
            ].join('\n'),
          )
        })
    })
  })

  describe('should catalog all files when component is located at a startPath', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component', version: 'v1.2.3', startPath: 'docs' })
      await repo.addFixtureFiles(['should-be-ignored.adoc'])
      await repo.addFixtureFiles(
        [
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/content/_attributes.adoc',
          'modules/ROOT/content/page-one.adoc',
        ],
        'docs',
      )
      playbook.content.sources.push({ location: repo.location, startPath: repo.startPath })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          expect(theCorpus[0].files).to.have.lengthOf(4)
          expect(theCorpus[0].files[0].path).to.equal('docs-component.yml')
          expect(theCorpus[0].files[1].path).to.equal('modules/ROOT/_attributes.adoc')
          expect(theCorpus[0].files[2].path).to.equal('modules/ROOT/content/_attributes.adoc')
          expect(theCorpus[0].files[3].path).to.equal('modules/ROOT/content/page-one.adoc')
        })
    })
  })

  // Join files from same component/version

  describe('should catalog files with same component version found in different branches', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
      await repo.addFixtureFiles(['modules/ROOT/content/page-one.adoc'])
      await repo.createBranch({ name: 'the-component', version: 'v1.2.3', branch: 'v1.2.3-fix-stuffs' })
      await repo.removeFixtureFiles(['modules/ROOT/content/page-one.adoc'])
      await repo.addFixtureFiles(['modules/ROOT/content/page-two.adoc'])
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-one.adoc' })
          expect(pageOne.src.origin.git.branch).to.equal('master')
          const pageTwo = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-two.adoc' })
          expect(pageTwo.src.origin.git.branch).to.equal('v1.2.3-fix-stuffs')
        })
    })
  })

  describe('should catalog files with same component version found in different repos', () => {
    testAll(async (theComponent, theOtherComponent) => {
      await theComponent.initRepo({
        repoName: 'the-component-foo',
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      })
      await theComponent.addFixtureFiles(['modules/ROOT/content/page-one.adoc'])
      playbook.content.sources.push({ location: theComponent.location })
      await theOtherComponent.initRepo({
        repoName: 'the-component-bar',
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      })
      await theOtherComponent.addFixtureFiles(['modules/ROOT/content/page-two.adoc'])
      playbook.content.sources.push({ location: theOtherComponent.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-one.adoc' })
          expect(pageOne.src.origin.git.url).to.equal(theComponent.location)
          const pageTwo = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-two.adoc' })
          expect(pageTwo.src.origin.git.url).to.equal(theOtherComponent.location)
        })
    }, 2)
  })

  describe('should merge/override docs-component.yml properties for same component version', () => {
    testAll(async (theComponent, theOtherComponent) => {
      await theComponent.initRepo({
        repoName: 'the-component-foo',
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        nav: ['nav.adoc'],
      })
      playbook.content.sources.push({ location: theComponent.location })
      await theOtherComponent.initRepo({
        repoName: 'the-component-bar',
        name: 'the-component',
        title: 'The Real Component Name',
        version: 'v1.2.3',
      })
      playbook.content.sources.push({ location: theOtherComponent.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({
            name: 'the-component',
            title: 'The Real Component Name',
            version: 'v1.2.3',
            nav: ['nav.adoc'],
          })
        })
    }, 2)
  })

  // Read local working files and use local cache

  async function initRepoWithWorkingFiles (repo) {
    await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
    await repo.addFixtureFiles([
      'modules/ROOT/_attributes.adoc',
      'modules/ROOT/content/_attributes.adoc',
      'modules/ROOT/content/page-one.adoc',
    ])
    await repo.copyAll(['modules/ROOT/content/page-two.adoc'])
  }

  it('should catalog files in work tree of local repo', async () => {
    const repo = new FixtureRepo({ isRemote: false, isBare: false })
    await initRepoWithWorkingFiles(repo)
    playbook.content.sources.push({ location: repo.location })
    const corpus = aggregateContent(playbook)
    return expect(corpus)
      .to.be.fulfilled()
      .then((theCorpus) => {
        expect(theCorpus).to.have.lengthOf(1)
        expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        expect(theCorpus[0].files).to.have.lengthOf(6)
        expect(theCorpus[0].files[0].path).to.equal('README.adoc')
        expect(theCorpus[0].files[1].path).to.equal('docs-component.yml')
        expect(theCorpus[0].files[2].path).to.equal('modules/ROOT/_attributes.adoc')
        expect(theCorpus[0].files[3].path).to.equal('modules/ROOT/content/_attributes.adoc')
        expect(theCorpus[0].files[4].path).to.equal('modules/ROOT/content/page-one.adoc')
        expect(theCorpus[0].files[5].path).to.equal('modules/ROOT/content/page-two.adoc')
      })
  })

  describe('should not catalog files in work tree', () => {
    function testNonWorkingFilesCatalog (repo) {
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          expect(theCorpus[0].files).to.have.lengthOf(5)
          expect(theCorpus[0].files[0].path).to.equal('README.adoc')
          expect(theCorpus[0].files[1].path).to.equal('docs-component.yml')
          expect(theCorpus[0].files[2].path).to.equal('modules/ROOT/_attributes.adoc')
          expect(theCorpus[0].files[3].path).to.equal('modules/ROOT/content/_attributes.adoc')
          expect(theCorpus[0].files[4].path).to.equal('modules/ROOT/content/page-one.adoc')
        })
    }

    it('on local bare repo', async () => {
      const repo = new FixtureRepo({ isRemote: false, isBare: true })
      await initRepoWithWorkingFiles(repo)
      return testNonWorkingFilesCatalog(repo)
    })

    it('on remote repo', async () => {
      const repo = new FixtureRepo({ isRemote: true, isBare: false })
      await initRepoWithWorkingFiles(repo)
      return testNonWorkingFilesCatalog(repo)
    })

    it('on remote bare repo', async () => {
      const repo = new FixtureRepo({ isRemote: true, isBare: true })
      await initRepoWithWorkingFiles(repo)
      return testNonWorkingFilesCatalog(repo)
    })
  })

  it('should refetch from remote into local cache', async () => {
    const repo = new FixtureRepo({ isRemote: true, isBare: true })
    await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
    await repo.addFixtureFiles(['modules/ROOT/content/page-one.adoc'])

    playbook.content.sources.push({ location: repo.location })
    const corpus = aggregateContent(playbook)

    await expect(corpus)
      .to.be.fulfilled()
      .then((theCorpus) => {
        expect(theCorpus).to.have.lengthOf(1)
        expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-one.adoc' })
        expect(pageOne).not.to.be.null()
      })

    await repo.createBranch({ name: 'the-component', version: 'v2.0.0' })
    await repo.addFixtureFiles(['modules/ROOT/content/page-two.adoc'])

    const secondCorpus = aggregateContent(playbook)
    return expect(secondCorpus)
      .to.be.fulfilled()
      .then((theCorpus) => {
        // console.log(theCorpus)
        expect(theCorpus).to.have.lengthOf(2)
        expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const pageTwoInVersionOne = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-two.adoc' })
        expect(pageTwoInVersionOne).to.be.undefined()
        expect(theCorpus[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
        const pageTwoInVersionTwo = _.find(theCorpus[1].files, { path: 'modules/ROOT/content/page-two.adoc' })
        expect(pageTwoInVersionTwo.path).to.equal('modules/ROOT/content/page-two.adoc')
      })
  })

  describe('should assign correct src properties to files', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ location: repo.location })
      const corpus = aggregateContent(playbook)
      return expect(corpus)
        .to.be.fulfilled()
        .then((theCorpus) => {
          expect(theCorpus).to.have.lengthOf(1)
          expect(theCorpus[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theCorpus[0].files, { path: 'modules/ROOT/content/page-one.adoc' })
          expect(pageOne.src).to.eql({
            basename: 'page-one.adoc',
            mediaType: 'text/asciidoc',
            stem: 'page-one',
            extname: '.adoc',
            origin: {
              git: {
                // in our test the git url is the same as the repo location we provided
                url: repo.location,
                branch: 'master',
                startPath: '/',
              },
            },
          })
        })
    })
  })
})
