/* eslint-env mocha */
'use strict'

const _ = require('lodash')
const aggregateContent = require('../lib/index')
const del = require('del')
const { expect } = require('../../../test/test-utils')
const FixtureRepo = require('./repo-utils')
const path = require('path')

const { COMPONENT_DESC_FILENAME } = require('../lib/constants')

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

  // Read & validate component desc

  describe('should throw if component desc cannot be found', () => {
    testAll(async (repo) => {
      await repo.initRepo({})
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate).to.be.rejectedWith(COMPONENT_DESC_FILENAME + ' not found')
    })
  })

  describe('should throw if component desc does not define a name', () => {
    testAll(async (repo) => {
      await repo.initRepo({ version: 'v1.0.0' })
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate).to.be.rejectedWith(COMPONENT_DESC_FILENAME + ' is missing a name')
    })
  })

  describe('should throw if component desc does not define a version', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component' })
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate).to.be.rejectedWith(COMPONENT_DESC_FILENAME + ' is missing a version')
    })
  })

  describe('should read properties from component desc', () => {
    testAll(async (repo) => {
      await repo.initRepo({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        nav: ['nav-one.adoc', 'nav-two.adoc'],
      })
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({
            name: 'the-component',
            title: 'The Component',
            version: 'v1.2.3',
            nav: ['nav-one.adoc', 'nav-two.adoc'],
          })
        })
    })
  })

  describe('should read properties from component desc located at specified startPath', () => {
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
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({
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
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(2)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', title: 'The Component', version: 'v1.2.3' })
          expect(theAggregate[1]).to.deep.include({
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
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'unknown' })
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
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(3)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
          expect(theAggregate[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
          expect(theAggregate[2]).to.deep.include({ name: 'the-component', version: 'v3.0.0' })
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
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(3)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'unknown' })
          expect(theAggregate[1]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
          expect(theAggregate[2]).to.deep.include({ name: 'the-component', version: 'v3.0.0' })
        })
    })
  })

  describe('should filter branches using playbook default filter "content.branches"', () => {
    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({ location: repo.location })
      playbook.content.branches = ['v1.0.0', 'v2*']
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(2)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
          expect(theAggregate[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
        })
    })

    testAll(async (repo) => {
      await initRepoWithBranches(repo)
      playbook.content.sources.push({ location: repo.location })
      playbook.content.branches = 'v1.0.*'
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.0.0' })
        })
    })
  })

  async function initRepoWithFiles (repo) {
    await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
    await repo.addFixtureFiles([
      'modules/ROOT/_attributes.adoc',
      'modules/ROOT/documents/_attributes.adoc',
      'modules/ROOT/documents/page-one.adoc',
      'modules/ROOT/documents/page-two.adoc',
      'modules/ROOT/documents/topic-a/_attributes.adoc',
      'modules/ROOT/documents/topic-a/page-three.adoc',
    ])
  }

  // Catalog all files

  describe('should catalog all files', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({
            name: 'the-component',
            version: 'v1.2.3',
          })
          expect(theAggregate[0].files).to.have.lengthOf(8)
          expect(theAggregate[0].files[0].path).to.equal('README.adoc')
          expect(theAggregate[0].files[1].path).to.equal(COMPONENT_DESC_FILENAME)
          expect(theAggregate[0].files[2].path).to.equal('modules/ROOT/_attributes.adoc')
          expect(theAggregate[0].files[3].path).to.equal('modules/ROOT/documents/_attributes.adoc')
          expect(theAggregate[0].files[4].path).to.equal('modules/ROOT/documents/page-one.adoc')
          expect(theAggregate[0].files[5].path).to.equal('modules/ROOT/documents/page-two.adoc')
          expect(theAggregate[0].files[6].path).to.equal('modules/ROOT/documents/topic-a/_attributes.adoc')
          expect(theAggregate[0].files[7].path).to.equal('modules/ROOT/documents/topic-a/page-three.adoc')
        })
    })
  })

  describe('should populate files with correct contents', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-one.adoc' })
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
            ].join('\n')
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
          'modules/ROOT/documents/_attributes.adoc',
          'modules/ROOT/documents/page-one.adoc',
        ],
        'docs'
      )
      playbook.content.sources.push({ location: repo.location, startPath: repo.startPath })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          expect(theAggregate[0].files).to.have.lengthOf(4)
          expect(theAggregate[0].files[0].path).to.equal(COMPONENT_DESC_FILENAME)
          expect(theAggregate[0].files[1].path).to.equal('modules/ROOT/_attributes.adoc')
          expect(theAggregate[0].files[2].path).to.equal('modules/ROOT/documents/_attributes.adoc')
          expect(theAggregate[0].files[3].path).to.equal('modules/ROOT/documents/page-one.adoc')
        })
    })
  })

  // Join files from same component/version

  describe('should catalog files with same component version found in different branches', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
      await repo.addFixtureFiles(['modules/ROOT/documents/page-one.adoc'])
      await repo.createBranch({ name: 'the-component', version: 'v1.2.3', branch: 'v1.2.3-fix-stuffs' })
      await repo.removeFixtureFiles(['modules/ROOT/documents/page-one.adoc'])
      await repo.addFixtureFiles(['modules/ROOT/documents/page-two.adoc'])
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-one.adoc' })
          expect(pageOne.src.origin.git.branch).to.equal('master')
          const pageTwo = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-two.adoc' })
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
      await theComponent.addFixtureFiles(['modules/ROOT/documents/page-one.adoc'])
      playbook.content.sources.push({ location: theComponent.location })
      await theOtherComponent.initRepo({
        repoName: 'the-component-bar',
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      })
      await theOtherComponent.addFixtureFiles(['modules/ROOT/documents/page-two.adoc'])
      playbook.content.sources.push({ location: theOtherComponent.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-one.adoc' })
          expect(pageOne.src.origin.git.url).to.equal(theComponent.location)
          const pageTwo = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-two.adoc' })
          expect(pageTwo.src.origin.git.url).to.equal(theOtherComponent.location)
        })
    }, 2)
  })

  describe('should merge component properties for same component version', () => {
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
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({
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
      'modules/ROOT/documents/_attributes.adoc',
      'modules/ROOT/documents/page-one.adoc',
    ])
    await repo.copyAll(['modules/ROOT/documents/page-two.adoc'])
  }

  it('should catalog files in work tree of local repo', async () => {
    const repo = new FixtureRepo({ isRemote: false, isBare: false })
    await initRepoWithWorkingFiles(repo)
    playbook.content.sources.push({ location: repo.location })
    const aggregate = aggregateContent(playbook)
    return expect(aggregate)
      .to.be.fulfilled()
      .then((theAggregate) => {
        expect(theAggregate).to.have.lengthOf(1)
        expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        expect(theAggregate[0].files).to.have.lengthOf(6)
        expect(theAggregate[0].files[0].path).to.equal('README.adoc')
        expect(theAggregate[0].files[1].path).to.equal(COMPONENT_DESC_FILENAME)
        expect(theAggregate[0].files[2].path).to.equal('modules/ROOT/_attributes.adoc')
        expect(theAggregate[0].files[3].path).to.equal('modules/ROOT/documents/_attributes.adoc')
        expect(theAggregate[0].files[4].path).to.equal('modules/ROOT/documents/page-one.adoc')
        expect(theAggregate[0].files[5].path).to.equal('modules/ROOT/documents/page-two.adoc')
      })
  })

  describe('should not catalog files in work tree', () => {
    function testNonWorkingFilesCatalog (repo) {
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          expect(theAggregate[0].files).to.have.lengthOf(5)
          expect(theAggregate[0].files[0].path).to.equal('README.adoc')
          expect(theAggregate[0].files[1].path).to.equal(COMPONENT_DESC_FILENAME)
          expect(theAggregate[0].files[2].path).to.equal('modules/ROOT/_attributes.adoc')
          expect(theAggregate[0].files[3].path).to.equal('modules/ROOT/documents/_attributes.adoc')
          expect(theAggregate[0].files[4].path).to.equal('modules/ROOT/documents/page-one.adoc')
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
    await repo.addFixtureFiles(['modules/ROOT/documents/page-one.adoc'])

    playbook.content.sources.push({ location: repo.location })
    const aggregate = aggregateContent(playbook)

    await expect(aggregate)
      .to.be.fulfilled()
      .then((theAggregate) => {
        expect(theAggregate).to.have.lengthOf(1)
        expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-one.adoc' })
        expect(pageOne).not.to.be.null()
      })

    await repo.createBranch({ name: 'the-component', version: 'v2.0.0' })
    await repo.addFixtureFiles(['modules/ROOT/documents/page-two.adoc'])

    const secondAggregate = aggregateContent(playbook)
    return expect(secondAggregate)
      .to.be.fulfilled()
      .then((theAggregate) => {
        expect(theAggregate).to.have.lengthOf(2)
        expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const pageTwoInVersionOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-two.adoc' })
        expect(pageTwoInVersionOne).to.be.undefined()
        expect(theAggregate[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
        const pageTwoInVersionTwo = _.find(theAggregate[1].files, { path: 'modules/ROOT/documents/page-two.adoc' })
        expect(pageTwoInVersionTwo.path).to.equal('modules/ROOT/documents/page-two.adoc')
      })
  })

  describe('should assign correct src properties to files', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ location: repo.location })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/documents/page-one.adoc' })
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
