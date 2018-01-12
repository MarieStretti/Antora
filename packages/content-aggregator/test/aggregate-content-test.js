/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const _ = require('lodash')
const aggregateContent = require('@antora/content-aggregator')
const FixtureRepository = require('./repo-utils')
const fs = require('fs-extra')
const path = require('path')

const { COMPONENT_DESC_FILENAME } = require('@antora/content-aggregator/lib/constants')
const CWD = process.cwd()
const WORK_DIR = path.resolve(__dirname, 'work')

function testAll (testFunction, count = 1) {
  function test (fixtureRepoOptions) {
    const repos = Array.from({ length: count }).map(() => new FixtureRepository(fixtureRepoOptions))
    return testFunction(...repos)
  }

  it('on local repo', () => test({ isRemote: false, isBare: false }))
  it('on local bare repo', () => test({ isRemote: false, isBare: true }))
  it('on remote repo', () => test({ isRemote: true, isBare: false }))
  it('on remote bare repo', () => test({ isRemote: true, isBare: true }))
}

function cleanReposAndCache () {
  fs.removeSync(FixtureRepository.BASE_DIR)
  fs.removeSync(WORK_DIR)
  process.chdir(CWD)
}

describe('aggregateContent()', () => {
  let playbook

  beforeEach(() => {
    cleanReposAndCache()
    fs.ensureDirSync(WORK_DIR)
    process.chdir(WORK_DIR)
    playbook = {
      content: {
        sources: [],
        branches: ['v*', 'master'],
      },
    }
  })

  afterEach(cleanReposAndCache)

  // Read & validate component desc

  describe('should throw if component desc cannot be found', () => {
    testAll(async (repo) => {
      await repo.initRepo({})
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate).to.be.rejectedWith(COMPONENT_DESC_FILENAME + ' not found')
    })
  })

  describe('should throw if component desc does not define a name', () => {
    testAll(async (repo) => {
      await repo.initRepo({ version: 'v1.0.0' })
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate).to.be.rejectedWith(COMPONENT_DESC_FILENAME + ' is missing a name')
    })
  })

  describe('should throw if component desc does not define a version', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component' })
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate).to.be.rejectedWith(COMPONENT_DESC_FILENAME + ' is missing a version')
    })
  })

  describe('should read properties from component desc and drop file', () => {
    testAll(async (repo) => {
      await repo.initRepo({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        nav: ['nav-one.adoc', 'nav-two.adoc'],
      })
      playbook.content.sources.push({ url: repo.url })
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
          const paths = theAggregate[0].files.map((file) => file.path)
          expect(paths).to.not.include(COMPONENT_DESC_FILENAME)
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
        url: repo.url,
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
      playbook.content.sources.push({ url: theComponent.url })
      await theOtherComponent.initRepo({ name: 'the-other-component', title: 'The Other Component', version: 'v4.5.6' })
      playbook.content.sources.push({ url: theOtherComponent.url })
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
        url: repo.url,
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
        url: repo.url,
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
        url: repo.url,
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
      playbook.content.sources.push({ url: repo.url })
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
      playbook.content.sources.push({ url: repo.url })
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
      'modules/ROOT/pages/_attributes.adoc',
      'modules/ROOT/pages/page-one.adoc',
      'modules/ROOT/pages/page-two.adoc',
      'modules/ROOT/pages/topic-a/_attributes.adoc',
      'modules/ROOT/pages/topic-a/page-three.adoc',
    ])
  }

  describe('should aggregate all files', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          const componentVersion = theAggregate[0]
          expect(componentVersion).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const expectedPaths = [
            'README.adoc',
            'modules/ROOT/_attributes.adoc',
            'modules/ROOT/pages/_attributes.adoc',
            'modules/ROOT/pages/page-one.adoc',
            'modules/ROOT/pages/page-two.adoc',
            'modules/ROOT/pages/topic-a/_attributes.adoc',
            'modules/ROOT/pages/topic-a/page-three.adoc',
          ]
          const files = componentVersion.files
          expect(files).to.have.lengthOf(expectedPaths.length)
          expectedPaths.forEach((expectedPath, i) => {
            expect(files[i].path).to.equal(expectedPath)
            expect(files[i].relative).to.equal(expectedPath)
          })
        })
    })
  })

  describe('should populate files with correct contents', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-one.adoc' })
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

  describe('should skip dotfiles, extensionless files, and directories that contain a dot', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      const fixturePaths = [
        // directory with extension
        'modules/ROOT/pages/ignore.me/page.adoc',
        // extensionless file
        'modules/ROOT/pages/ignore-me',
        // dotfile
        'modules/ROOT/pages/.ignore-me',
        // dotfile with extension
        'modules/ROOT/pages/.ignore-me.txt',
        // dotdirectory
        'modules/ROOT/pages/.ignore-it/page.adoc',
        // dotdirectory with extension
        'modules/ROOT/pages/.ignore.rc/page.adoc',
        // dotfile at root
        '.ignore-me',
        // dotfile with extension at root
        '.ignore-me.txt',
        // dotdirectory at root
        '.ignore-it/run.sh',
        // dotdirectory with extension at root
        '.ignore.rc/run.sh',
      ]
      const ignoredPaths = fixturePaths.filter(
        (path_) =>
          // the file is allowed, just make sure the directory isn't stored
          path_ !== 'modules/ROOT/pages/ignore.me/page.adoc'
      )
      await repo.addFixtureFiles(fixturePaths)
      playbook.content.sources.push({ url: repo.url, startPath: repo.startPath })
      const aggregate = await aggregateContent(playbook)
      expect(aggregate).to.have.lengthOf(1)
      const files = aggregate[0].files
      const paths = files.map((f) => f.path)
      ignoredPaths.forEach((ignoredPath) => expect(paths).to.not.include(ignoredPath))
      files.forEach((file) => expect(file.isDirectory()).to.be.false())
    })
  })

  describe('should aggregate all files when component is located at a startPath', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component', version: 'v1.2.3', startPath: 'docs' })
      await repo.addFixtureFiles(['should-be-ignored.adoc'])
      await repo.addFixtureFiles(
        ['modules/ROOT/_attributes.adoc', 'modules/ROOT/pages/_attributes.adoc', 'modules/ROOT/pages/page-one.adoc'],
        'docs'
      )
      playbook.content.sources.push({ url: repo.url, startPath: repo.startPath })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          const componentVersion = theAggregate[0]
          expect(componentVersion).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const expectedPaths = [
            'modules/ROOT/_attributes.adoc',
            'modules/ROOT/pages/_attributes.adoc',
            'modules/ROOT/pages/page-one.adoc',
          ]
          const files = componentVersion.files
          expect(files).to.have.lengthOf(expectedPaths.length)
          expectedPaths.forEach((expectedPath, i) => {
            expect(files[i].path).to.equal(expectedPath)
            expect(files[i].relative).to.equal(expectedPath)
          })
        })
    })
  })

  // Join files from same component/version

  describe('should aggregate files with same component version found in different branches', () => {
    testAll(async (repo) => {
      await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
      await repo.addFixtureFiles(['modules/ROOT/pages/page-one.adoc'])
      await repo.createBranch({ name: 'the-component', version: 'v1.2.3', branch: 'v1.2.3-fix-stuffs' })
      await repo.removeFixtureFiles(['modules/ROOT/pages/page-one.adoc'])
      await repo.addFixtureFiles(['modules/ROOT/pages/page-two.adoc'])
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-one.adoc' })
          expect(pageOne.src.origin.git.branch).to.equal('master')
          const pageTwo = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-two.adoc' })
          expect(pageTwo.src.origin.git.branch).to.equal('v1.2.3-fix-stuffs')
        })
    })
  })

  describe('should aggregate files with same component version found in different repos', () => {
    testAll(async (theComponent, theOtherComponent) => {
      await theComponent.initRepo({
        repoName: 'the-component-foo',
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      })
      await theComponent.addFixtureFiles(['modules/ROOT/pages/page-one.adoc'])
      playbook.content.sources.push({ url: theComponent.url })
      await theOtherComponent.initRepo({
        repoName: 'the-component-bar',
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      })
      await theOtherComponent.addFixtureFiles(['modules/ROOT/pages/page-two.adoc'])
      playbook.content.sources.push({ url: theOtherComponent.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-one.adoc' })
          expect(pageOne.src.origin.git.url).to.equal(theComponent.url)
          const pageTwo = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-two.adoc' })
          expect(pageTwo.src.origin.git.url).to.equal(theOtherComponent.url)
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
      playbook.content.sources.push({ url: theComponent.url })
      await theOtherComponent.initRepo({
        repoName: 'the-component-bar',
        name: 'the-component',
        title: 'The Real Component Name',
        version: 'v1.2.3',
      })
      playbook.content.sources.push({ url: theOtherComponent.url })
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
      'modules/ROOT/pages/_attributes.adoc',
      'modules/ROOT/pages/page-one.adoc',
    ])
    await repo.copyAll(['modules/ROOT/pages/page-two.adoc'])
  }

  it('should catalog files in worktree of local repo', async () => {
    const repo = new FixtureRepository({ isRemote: false, isBare: false })
    await initRepoWithWorkingFiles(repo)
    playbook.content.sources.push({ url: repo.url })
    const aggregate = aggregateContent(playbook)
    return expect(aggregate)
      .to.be.fulfilled()
      .then((theAggregate) => {
        expect(theAggregate).to.have.lengthOf(1)
        const componentVersion = theAggregate[0]
        expect(componentVersion).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const expectedPaths = [
          'README.adoc',
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
          'modules/ROOT/pages/page-two.adoc',
        ]
        const files = theAggregate[0].files
        expect(files).to.have.lengthOf(expectedPaths.length)
        expectedPaths.forEach((expectedPath, i) => {
          expect(files[i].path).to.equal(expectedPath)
          expect(files[i].relative).to.equal(expectedPath)
        })
      })
  })

  describe('should not catalog files in worktree', () => {
    function testNonWorkingFilesCatalog (repo) {
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          const componentVersion = theAggregate[0]
          expect(componentVersion).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const expectedPaths = [
            'README.adoc',
            'modules/ROOT/_attributes.adoc',
            'modules/ROOT/pages/_attributes.adoc',
            'modules/ROOT/pages/page-one.adoc',
          ]
          const files = componentVersion.files
          expect(files).to.have.lengthOf(expectedPaths.length)
          expectedPaths.forEach((expectedPath, i) => {
            expect(files[i].path).to.equal(expectedPath)
            expect(files[i].relative).to.equal(expectedPath)
          })
        })
    }

    it('on local bare repo', async () => {
      const repo = new FixtureRepository({ isRemote: false, isBare: true })
      await initRepoWithWorkingFiles(repo)
      return testNonWorkingFilesCatalog(repo)
    })

    it('on remote repo', async () => {
      const repo = new FixtureRepository({ isRemote: true, isBare: false })
      await initRepoWithWorkingFiles(repo)
      return testNonWorkingFilesCatalog(repo)
    })

    it('on remote bare repo', async () => {
      const repo = new FixtureRepository({ isRemote: true, isBare: true })
      await initRepoWithWorkingFiles(repo)
      return testNonWorkingFilesCatalog(repo)
    })
  })

  it('should refetch from remote into local cache', async () => {
    const repo = new FixtureRepository({ isRemote: true, isBare: true })
    await repo.initRepo({ name: 'the-component', version: 'v1.2.3' })
    await repo.addFixtureFiles(['modules/ROOT/pages/page-one.adoc'])

    playbook.content.sources.push({ url: repo.url })
    const aggregate = aggregateContent(playbook)

    await expect(aggregate)
      .to.be.fulfilled()
      .then((theAggregate) => {
        expect(theAggregate).to.have.lengthOf(1)
        expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-one.adoc' })
        expect(pageOne).not.to.be.null()
      })

    await repo.createBranch({ name: 'the-component', version: 'v2.0.0' })
    await repo.addFixtureFiles(['modules/ROOT/pages/page-two.adoc'])

    const secondAggregate = aggregateContent(playbook)
    return expect(secondAggregate)
      .to.be.fulfilled()
      .then((theAggregate) => {
        expect(theAggregate).to.have.lengthOf(2)
        expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
        const pageTwoInVersionOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-two.adoc' })
        expect(pageTwoInVersionOne).to.be.undefined()
        expect(theAggregate[1]).to.deep.include({ name: 'the-component', version: 'v2.0.0' })
        const pageTwoInVersionTwo = _.find(theAggregate[1].files, { path: 'modules/ROOT/pages/page-two.adoc' })
        expect(pageTwoInVersionTwo.path).to.equal('modules/ROOT/pages/page-two.adoc')
      })
  })

  describe('should assign correct properties to virtual file', () => {
    testAll(async (repo) => {
      await initRepoWithFiles(repo)
      playbook.content.sources.push({ url: repo.url })
      const aggregate = aggregateContent(playbook)
      return expect(aggregate)
        .to.be.fulfilled()
        .then((theAggregate) => {
          expect(theAggregate).to.have.lengthOf(1)
          expect(theAggregate[0]).to.deep.include({ name: 'the-component', version: 'v1.2.3' })
          const pageOne = _.find(theAggregate[0].files, { path: 'modules/ROOT/pages/page-one.adoc' })
          const expectedFile = {
            path: 'modules/ROOT/pages/page-one.adoc',
            relative: 'modules/ROOT/pages/page-one.adoc',
            dirname: 'modules/ROOT/pages',
            basename: 'page-one.adoc',
            stem: 'page-one',
            extname: '.adoc',
            mediaType: 'text/asciidoc',
          }
          const expectedFileSrc = {
            path: expectedFile.path,
            basename: expectedFile.basename,
            stem: expectedFile.stem,
            extname: expectedFile.extname,
            mediaType: expectedFile.mediaType,
            origin: {
              git: {
                // in our test the git url is the same as the repo url we provided
                url: repo.url,
                branch: 'master',
                startPath: '/',
              },
            },
          }
          if (!repo.isRemote && !repo.isBare) {
            expectedFileSrc.abspath = path.join(repo.url, expectedFileSrc.path)
          }
          expect(pageOne).to.include(expectedFile)
          expect(pageOne.src).to.eql(expectedFileSrc)
        })
    })
  })
})