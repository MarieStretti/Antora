/* eslint-env mocha */
'use strict'

const { deferExceptions, expect, heredoc } = require('../../../test/test-utils')

const aggregateContent = require('@antora/content-aggregator')
const fs = require('fs-extra')
const git = require('nodegit')
const ospath = require('path')
const RepositoryBuilder = require('../../../test/repository-builder')

const { COMPONENT_DESC_FILENAME, CONTENT_CACHE_PATH } = require('@antora/content-aggregator/lib/constants')
const CONTENT_REPOS_DIR = ospath.join(__dirname, 'content-repos')
const CWD = process.cwd()
const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')
const WORK_DIR = ospath.join(__dirname, 'work')

function testAll (testBlock, numRepoBuilders = 1) {
  const makeTest = (repoBuilderOpts) => {
    const repoBuilders = Array.from(
      { length: numRepoBuilders },
      () => new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, repoBuilderOpts)
    )
    return testBlock(...repoBuilders)
  }

  it('on local repo', () => makeTest())
  it('on local bare repo', () => makeTest({ bare: true }))
  it('on remote repo', () => makeTest({ remote: true }))
  it('on remote bare repo', () => makeTest({ remote: true, bare: true }))
}

describe('aggregateContent()', () => {
  let playbookSpec

  const initRepoWithFiles = async (repoBuilder, componentDesc, paths, beforeClose) => {
    let repoName
    if (componentDesc && 'repoName' in componentDesc) {
      repoName = componentDesc.repoName
      delete componentDesc.repoName
    }
    if (!componentDesc || !Object.getOwnPropertyNames(componentDesc).length) {
      componentDesc = { name: 'the-component', version: 'v1.2.3' }
    }
    if (paths) {
      if (!Array.isArray(paths)) paths = [paths]
    } else {
      paths = [
        'README.adoc',
        'modules/ROOT/_attributes.adoc',
        'modules/ROOT/pages/_attributes.adoc',
        'modules/ROOT/pages/page-one.adoc',
        'modules/ROOT/pages/page-two.adoc',
        'modules/ROOT/pages/topic-a/_attributes.adoc',
        'modules/ROOT/pages/topic-a/page-three.adoc',
      ]
    }
    return repoBuilder
      .init(repoName || componentDesc.name)
      .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
      .then(() => repoBuilder.addFilesFromFixture(paths))
      .then(() => beforeClose && beforeClose())
      .then(() => repoBuilder.close())
  }

  const posixify = ospath.sep === '\\' ? (p) => p.replace(/\\/g, '/') : undefined

  // NOTE remove can fail multiple times on Windows
  const clean = (fin) => {
    process.chdir(CWD)
    const timeout = 5000
    let retry
    let start
    retry = true
    start = Date.now()
    while (retry) {
      try {
        fs.removeSync(CONTENT_REPOS_DIR)
        retry = false
      } catch (e) {
        if (Date.now() - start > timeout) throw e
      }
    }
    retry = true
    start = Date.now()
    while (retry) {
      try {
        // NOTE work dir stores the cache
        fs.removeSync(WORK_DIR)
        retry = false
      } catch (e) {
        if (Date.now() - start > timeout) throw e
      }
    }
    if (!fin) {
      fs.ensureDirSync(WORK_DIR)
      process.chdir(WORK_DIR)
    }
  }

  beforeEach(() => {
    playbookSpec = {
      content: {
        sources: [],
        branches: ['v*', 'master'],
      },
    }
    clean()
  })

  after(() => {
    clean(true)
  })

  describe('read component descriptor', () => {
    const initRepoWithComponentDescriptor = async (repoBuilder, componentDesc, beforeClose) =>
      repoBuilder
        .init(componentDesc.name)
        .then(() => repoBuilder.addComponentDescriptor(componentDesc))
        .then(() => beforeClose && beforeClose())
        .then(() => repoBuilder.close())

    describe('should throw if component descriptor cannot be found', () => {
      testAll(async (repoBuilder) => {
        await repoBuilder.init('the-component').then(() => repoBuilder.close())
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(COMPONENT_DESC_FILENAME + ' not found')
      })
    })

    describe('should throw if component descriptor does not define a name', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithComponentDescriptor(repoBuilder, { version: 'v1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(COMPONENT_DESC_FILENAME + ' is missing a name')
      })
    })

    describe('should throw if component descriptor does not define a version', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(COMPONENT_DESC_FILENAME + ' is missing a version')
      })
    })

    describe('should read properties from component descriptor then drop file', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          nav: ['nav-one.adoc', 'nav-two.adoc'],
        }
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
        const paths = aggregate[0].files.map((file) => file.path)
        expect(paths).to.not.include(COMPONENT_DESC_FILENAME)
      })
    })

    describe('should read properties from component descriptor located at specified start path', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          nav: ['nav-one.adoc', 'nav-two.adoc'],
          startPath: 'docs',
        }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, async () =>
          repoBuilder.repository.getHeadCommit().then((head) =>
            head.getTree().then((headTree) =>
              headTree
                .getEntry('docs/antora.yml')
                .then((entry) => {
                  componentDescEntry = entry
                })
                .catch(() => {})
            )
          )
        )
        expect(componentDescEntry).to.exist()
        expect(repoBuilder.startPath).to.equal('docs')
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: repoBuilder.startPath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should discover components across multiple repositories', () => {
      testAll(async (repoBuilderA, repoBuilderB) => {
        const componentDescA = { name: 'the-component', title: 'The Component', version: 'v1.2' }
        await initRepoWithComponentDescriptor(repoBuilderA, componentDescA)
        playbookSpec.content.sources.push({ url: repoBuilderA.url })

        const componentDescB = { name: 'the-other-component', title: 'The Other Component', version: 'v3.4' }
        await initRepoWithComponentDescriptor(repoBuilderB, componentDescB)
        playbookSpec.content.sources.push({ url: repoBuilderB.url })

        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include(componentDescA)
        expect(aggregate[1]).to.include(componentDescB)
      }, 2)
    })

    it('should resolve local repository path relative to playbook dir if set', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      playbookSpec.content.sources.push({ url: ospath.relative(WORK_DIR, repoBuilder.url) })
      playbookSpec.dir = WORK_DIR
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.deep.include(componentDesc)
    })

    it('should resolve local repository path relative to process.cwd() if playbook dir not set', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      playbookSpec.content.sources.push({ url: ospath.relative(WORK_DIR, repoBuilder.url) })
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.deep.include(componentDesc)
    })

    it('should disregard playbook dir if repository path is absolute', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      playbookSpec.dir = WORK_DIR
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.deep.include(componentDesc)
    })
  })

  describe('filter branches', () => {
    const initRepoWithBranches = async (repoBuilder, componentName = 'the-component', beforeClose) =>
      repoBuilder
        .init(componentName)
        .then(() => repoBuilder.addComponentDescriptor({ name: componentName, version: 'latest-and-greatest' }))
        .then(() => repoBuilder.checkoutBranch('v1.0'))
        .then(() => repoBuilder.addComponentDescriptor({ name: componentName, version: 'v1.0' }))
        .then(() => repoBuilder.checkoutBranch('v3.0'))
        .then(() => repoBuilder.addComponentDescriptor({ name: componentName, version: 'v3.0' }))
        .then(() => repoBuilder.checkoutBranch('v2.0'))
        .then(() => repoBuilder.addComponentDescriptor({ name: componentName, version: 'v2.0' }))
        .then(() => beforeClose && beforeClose())
        .then(() => repoBuilder.close('master'))

    describe('should filter branches by exact name', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'master' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
      })
    })

    describe('should filter branches using wildcard', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should filter branches using multiple filters', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({
          url: repoBuilder.url,
          branches: ['master', 'v1*', 'v3.*'],
        })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should select refs which are branches', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', async () => repoBuilder.createTag('v1.0.0', 'v1.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should filter branches using default filter as array', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        playbookSpec.content.branches = ['v1.0', 'v2*']
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
      })
    })

    describe('should filter branches using default filter as string', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        playbookSpec.content.branches = 'v1.*'
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
      })
    })

    describe('should allow current branch to be selected', () => {
      it('should select current branch if pattern is HEAD', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.close('v3.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'HEAD' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should select current branch if pattern is .', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.close('v3.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: '.' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should select current branch if pattern includes HEAD', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.close('v3.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: ['master', 'HEAD'] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should select current branch if pattern includes .', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.close('v3.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: ['master', '.'] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should ignore HEAD if not on a branch', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.repository.detachHead())
          .then(() => repoBuilder.close())
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: ['HEAD', 'v*'] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })
  })

  describe('aggregate files from repository', () => {
    describe('should clone repository into cache folder', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        await aggregateContent(playbookSpec)
        const contentCacheAbsDir = ospath.join(WORK_DIR, CONTENT_CACHE_PATH)
        if (repoBuilder.remote) {
          const repoDir =
            repoBuilder.url
              .toLowerCase()
              .replace(/^file:\/+/, '')
              .replace(/^([a-z]):(?=\/)/, '$1')
              .replace(/\/?\.git$/, '')
              .replace(/\//g, '%') + '.git'
          expect(contentCacheAbsDir).to.be.a.directory()
          expect(ospath.join(contentCacheAbsDir, repoDir))
            .to.be.a.directory()
            .and.include.files(['HEAD'])
        } else {
          expect(contentCacheAbsDir).to.not.be.a.path()
        }
      })
    })

    describe('should aggregate all files', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include({ name: 'the-component', version: 'v1.2.3' })
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
        const paths = files.map((file) => file.path)
        const relatives = files.map((file) => file.relative)
        expect(paths).to.have.members(expectedPaths)
        expect(relatives).to.have.members(expectedPaths)
        files.forEach((file) => expect(file.stat.isFile()).to.be.true())
      })
    })

    describe('should populate files with correct contents', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne.contents.toString()).to.equal(
          heredoc`
          = Page One
          ifndef::env-site,env-github[]
          include::_attributes.adoc[]
          endif::[]
          :keywords: foo, bar

          Hey World!
          ` + '\n'
        )
      })
    })

    describe('should skip dotfiles, extensionless files, and directories that contain a dot', () => {
      testAll(async (repoBuilder) => {
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
        await initRepoWithFiles(repoBuilder, {}, undefined, async () => repoBuilder.addFilesFromFixture(fixturePaths))
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const files = aggregate[0].files
        const paths = files.map((f) => f.path)
        ignoredPaths.forEach((ignoredPath) => expect(paths).to.not.include(ignoredPath))
        files.forEach((file) => expect(file.isDirectory()).to.be.false())
      })
    })

    describe('should aggregate all files when component is located at a start path', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.2.3', startPath: 'docs' }
        const fixturePaths = [
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
        ]
        await initRepoWithFiles(repoBuilder, componentDesc, fixturePaths, async () =>
          repoBuilder.addFilesFromFixture('should-be-ignored.adoc', '', false)
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: repoBuilder.startPath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include(componentDesc)
        const files = componentVersion.files
        expect(files).to.have.lengthOf(fixturePaths.length)
        const paths = files.map((file) => file.path)
        const relatives = files.map((file) => file.relative)
        expect(paths).to.have.members(fixturePaths)
        expect(relatives).to.have.members(fixturePaths)
        files.forEach((file) => expect(file).to.have.nested.property('src.origin.startPath', 'docs'))
      })
    })

    describe('should aggregate all files when component is located at a nested start path', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.2.3', startPath: 'src/docs' }
        const fixturePaths = [
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
        ]
        await initRepoWithFiles(repoBuilder, componentDesc, fixturePaths, async () =>
          repoBuilder.addFilesFromFixture('should-be-ignored.adoc', '', false)
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: repoBuilder.startPath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include(componentDesc)
        const files = componentVersion.files
        expect(files).to.have.lengthOf(fixturePaths.length)
        const paths = files.map((file) => file.path)
        const relatives = files.map((file) => file.relative)
        expect(paths).to.have.members(fixturePaths)
        expect(relatives).to.have.members(fixturePaths)
        files.forEach((file) => expect(file).to.have.nested.property('src.origin.startPath', 'src/docs'))
      })
    })

    describe('should trim leading and trailing slashes from start path', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.2.3', startPath: '/src/docs/' }
        const fixturePaths = ['modules/ROOT/pages/page-one.adoc']
        await initRepoWithFiles(repoBuilder, componentDesc, fixturePaths)
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: repoBuilder.startPath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include(componentDesc)
        const files = componentVersion.files
        expect(files).to.have.lengthOf(fixturePaths.length)
        files.forEach((file) => expect(file).to.have.nested.property('src.origin.startPath', 'src/docs'))
      })
    })

    describe('should assign correct properties to virtual file', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
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
            type: 'git',
            // in our test the git url is the same as the repo url we provided
            url: repoBuilder.url,
            branch: 'master',
            startPath: '',
          },
        }
        if (!(repoBuilder.bare || repoBuilder.remote)) {
          expectedFileSrc.abspath = ospath.join(repoBuilder.repoPath, expectedFileSrc.path)
          const fileUriScheme = posixify ? 'file:///' : 'file://'
          expectedFileSrc.origin.editUrlPattern = fileUriScheme + repoBuilder.repoPath + '/%s'
          expectedFileSrc.origin.worktree = true
          expectedFileSrc.editUrl = fileUriScheme + expectedFileSrc.abspath
          if (posixify) {
            expectedFileSrc.origin.editUrlPattern = posixify(expectedFileSrc.origin.editUrlPattern)
            expectedFileSrc.editUrl = posixify(expectedFileSrc.editUrl)
          }
        }
        expect(pageOne).to.include(expectedFile)
        expect(pageOne.src).to.eql(expectedFileSrc)
      })
    })

    describe('remote origin data', () => {
      it('should generate correct origin data for file taken from repository on GitHub', () => {
        const urls = [
          'https://github.com/org-name/repo-name.git',
          'https://github.com/org-name/repo-name',
          'git@github.com:org-name/repo-name.git',
          'git@github.com:org-name/repo-name',
        ]
        const branch = 'master'
        const expectedEditUrlPattern = 'https://github.com/org-name/repo-name/edit/' + branch + '/%s'
        urls.forEach((url) => {
          const origin = aggregateContent._resolveOrigin(url, branch, '')
          expect(origin.url).to.equal(url)
          expect(origin.branch).to.equal(branch)
          expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
        })
      })

      it('should generate correct origin data for file taken from repository on GitLab', () => {
        const urls = [
          'https://gitlab.com/org-name/repo-name.git',
          'https://gitlab.com/org-name/repo-name',
          'git@gitlab.com:org-name/repo-name.git',
          'git@gitlab.com:org-name/repo-name',
        ]
        const branch = 'master'
        const expectedEditUrlPattern = 'https://gitlab.com/org-name/repo-name/edit/' + branch + '/%s'
        urls.forEach((url) => {
          const origin = aggregateContent._resolveOrigin(url, branch, '')
          expect(origin.url).to.equal(url)
          expect(origin.branch).to.equal(branch)
          expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
        })
      })

      it('should generate correct origin data for file taken from repository on BitBucket', () => {
        const urls = [
          'https://bitbucket.org/org-name/repo-name.git',
          'https://bitbucket.org/org-name/repo-name',
          'git@bitbucket.org:org-name/repo-name.git',
          'git@bitbucket.org:org-name/repo-name',
        ]
        const branch = 'master'
        const expectedEditUrlPattern = 'https://bitbucket.org/org-name/repo-name/src/' + branch + '/%s'
        urls.forEach((url) => {
          const origin = aggregateContent._resolveOrigin(url, branch, '')
          expect(origin.url).to.equal(url)
          expect(origin.branch).to.equal(branch)
          expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
        })
      })

      it('should generate correct origin data for file taken from worktree', () => {
        const url = 'the-component'
        const worktreePath = ospath.join(CONTENT_REPOS_DIR, url)
        const branch = 'master'
        const expectedEditUrlPattern = posixify
          ? 'file:///' + posixify(worktreePath) + '/%s'
          : 'file://' + worktreePath + '/%s'
        const origin = aggregateContent._resolveOrigin(url, branch, '', worktreePath)
        expect(origin.url).to.equal(url)
        expect(origin.branch).to.equal(branch)
        expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
      })
    })
  })

  describe('join component version', () => {
    describe('should aggregate files with same component version found in different branches', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.2.3' }
        await repoBuilder
          .init(componentDesc.name)
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-one.adoc'))
          .then(() => repoBuilder.checkoutBranch('v1.2.3-fixes'))
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.removeFromWorktree('modules/ROOT/pages/page-one.adoc'))
          .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-two.adoc'))
          .then(() => repoBuilder.close('master'))
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne.src.origin.branch).to.equal('master')
        const pageTwo = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
        expect(pageTwo.src.origin.branch).to.equal('v1.2.3-fixes')
      })
    })

    describe('should aggregate files with same component version found in different repos', () => {
      testAll(async (repoBuilderA, repoBuilderB) => {
        await initRepoWithFiles(repoBuilderA, { repoName: 'the-component-repo-a' }, 'modules/ROOT/pages/page-one.adoc')
        playbookSpec.content.sources.push({ url: repoBuilderA.url })
        await initRepoWithFiles(repoBuilderB, { repoName: 'the-component-repo-b' }, 'modules/ROOT/pages/page-two.adoc')
        playbookSpec.content.sources.push({ url: repoBuilderB.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne.src.origin.url).to.equal(repoBuilderA.url)
        const pageTwo = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
        expect(pageTwo.src.origin.url).to.equal(repoBuilderB.url)
      }, 2)
    })

    describe('should merge component properties for same component version', () => {
      testAll(async (repoBuilderA, repoBuilderB) => {
        const componentDescA = {
          repoName: 'the-component-repo-a',
          name: 'the-component',
          title: 'The Vetoed Component Title',
          version: 'v1.2.3',
          nav: ['nav.adoc'],
        }
        await initRepoWithFiles(repoBuilderA, componentDescA, [])
        playbookSpec.content.sources.push({ url: repoBuilderA.url })
        const componentDescB = {
          repoName: 'the-component-repo-b',
          name: 'the-component',
          title: 'The Real Component Title',
          version: 'v1.2.3',
        }
        await initRepoWithFiles(repoBuilderB, componentDescB, [])
        playbookSpec.content.sources.push({ url: repoBuilderB.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include({
          name: 'the-component',
          title: 'The Real Component Title',
          version: 'v1.2.3',
          nav: ['nav.adoc'],
        })
      }, 2)
    })
  })

  describe('aggregate files from worktree', () => {
    const initRepoWithFilesAndWorktree = async (repoBuilder) => {
      const componentDesc = { name: 'the-component', version: 'v1.2.3' }
      return repoBuilder
        .init(componentDesc.name)
        .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
        .then(() =>
          repoBuilder.addFilesFromFixture([
            'README.adoc',
            'modules/ROOT/_attributes.adoc',
            'modules/ROOT/pages/_attributes.adoc',
            'modules/ROOT/pages/page-one.adoc',
          ])
        )
        .then(() => repoBuilder.copyToWorktree(['modules/ROOT/pages/page-two.adoc'], repoBuilder.fixtureBase))
        .then(() => repoBuilder.close())
    }

    describe('should catalog files in worktree', () => {
      it('on local repo', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithFilesAndWorktree(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include({ name: 'the-component', version: 'v1.2.3' })
        const expectedPaths = [
          'README.adoc',
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
          'modules/ROOT/pages/page-two.adoc',
        ]
        const files = aggregate[0].files
        expect(files).to.have.lengthOf(expectedPaths.length)
        const paths = files.map((file) => file.path)
        const relatives = files.map((file) => file.relative)
        expect(paths).to.have.members(expectedPaths)
        expect(relatives).to.have.members(expectedPaths)
      })

      it('should set src.abspath and src.origin.worktree properties on files taken from worktree', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithFilesAndWorktree(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include({ name: 'the-component', version: 'v1.2.3' })
        const expectedPaths = [
          'README.adoc',
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
          'modules/ROOT/pages/page-two.adoc',
        ].map((p) => ospath.join(repoBuilder.repoPath, p))
        const files = aggregate[0].files
        expect(files).to.have.lengthOf(expectedPaths.length)
        expect(files[0].src).to.have.property('abspath')
        const paths = files.map((file) => file.src.abspath)
        expect(paths).to.have.members(expectedPaths)
        files.forEach((file) => expect(file).to.have.nested.property('src.origin.worktree', true))
      })

      it('should set src.editUrl property on files taken from worktree', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithFilesAndWorktree(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include({ name: 'the-component', version: 'v1.2.3' })
        const fileUriBase = posixify ? 'file:///' + posixify(repoBuilder.repoPath) : 'file://' + repoBuilder.repoPath
        const expectedUrls = [
          'README.adoc',
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
          'modules/ROOT/pages/page-two.adoc',
        ].map((p) => fileUriBase + '/' + p)
        const files = aggregate[0].files
        expect(files).to.have.lengthOf(expectedUrls.length)
        expect(files[0].src).to.have.property('editUrl')
        const editUrls = files.map((file) => file.src.editUrl)
        expect(editUrls).to.have.members(expectedUrls)
      })

      it('should populate file with correct contents from worktree of clone', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true, remote: true })
        await initRepoWithFilesAndWorktree(repoBuilder)
        const clonePath = ospath.join(CONTENT_REPOS_DIR, 'clone')
        await git.Clone.clone(repoBuilder.url, clonePath)
        const wipPageContents = heredoc`
          = WIP

          This is going to be something special.
        `
        await fs.writeFile(ospath.join(clonePath, 'modules/ROOT/pages/wip-page.adoc'), wipPageContents)
        playbookSpec.content.sources.push({ url: clonePath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const files = aggregate[0].files
        const pageOne = files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne.contents.toString()).to.equal(
          heredoc`
          = Page One
          ifndef::env-site,env-github[]
          include::_attributes.adoc[]
          endif::[]
          :keywords: foo, bar

          Hey World!
          ` + '\n'
        )
        const wipPage = files.find((file) => file.path === 'modules/ROOT/pages/wip-page.adoc')
        expect(wipPage.contents.toString()).to.equal(wipPageContents)
      })
    })

    describe('should not catalog files in worktree', () => {
      const testNonWorktreeAggregate = async (repoBuilder) => {
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include({ name: 'the-component', version: 'v1.2.3' })
        const expectedPaths = [
          'README.adoc',
          'modules/ROOT/_attributes.adoc',
          'modules/ROOT/pages/_attributes.adoc',
          'modules/ROOT/pages/page-one.adoc',
        ]
        const files = componentVersion.files
        expect(files).to.have.lengthOf(expectedPaths.length)
        const paths = files.map((file) => file.path)
        const relatives = files.map((file) => file.relative)
        expect(paths).to.have.members(expectedPaths)
        expect(relatives).to.have.members(expectedPaths)
      }

      it('on local bare repo', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true })
        await initRepoWithFilesAndWorktree(repoBuilder)
        await testNonWorktreeAggregate(repoBuilder)
      })

      it('on remote repo', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: true })
        await initRepoWithFilesAndWorktree(repoBuilder)
        await testNonWorktreeAggregate(repoBuilder)
      })

      it('on remote bare repo', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true, remote: true })
        await initRepoWithFilesAndWorktree(repoBuilder)
        await testNonWorktreeAggregate(repoBuilder)
      })
    })
  })

  it('should synchronize cached repository with remote', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true, remote: true })
    await initRepoWithFiles(repoBuilder, undefined, 'modules/ROOT/pages/page-one.adoc', () =>
      repoBuilder.checkoutBranch('v1.2.3')
    )
    playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })

    const firstAggregate = await aggregateContent(playbookSpec)

    expect(firstAggregate).to.have.lengthOf(1)
    expect(firstAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    let page1v1 = firstAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v1).to.exist()

    await repoBuilder
      .open()
      .then(() => repoBuilder.checkoutBranch('v2.0.0'))
      .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v2.0.0' }))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-two.adoc'))
      .then(() => repoBuilder.checkoutBranch('v1.2.3'))
      .then(() => repoBuilder.addToWorktree('modules/ROOT/pages/page-one.adoc', '= Page One\n\nUpdate received!'))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/topic-a/page-three.adoc'))
      .then(() => repoBuilder.close())

    const secondAggregate = await aggregateContent(playbookSpec)

    expect(secondAggregate).to.have.lengthOf(2)
    expect(secondAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    page1v1 = secondAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v1).to.exist()
    expect(page1v1.contents.toString()).to.have.string('Update received!')
    const page2v1 = secondAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
    expect(page2v1).to.not.exist()
    const page3v1 = secondAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/topic-a/page-three.adoc')
    expect(page3v1).to.exist()
    expect(secondAggregate[1]).to.include({ name: 'the-component', version: 'v2.0.0' })
    const page1v2 = secondAggregate[1].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v2).to.exist()
    expect(page1v2.contents.toString()).to.not.have.string('Update received!')
    const page2v2 = secondAggregate[1].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
    expect(page2v2).to.exist()
  })

  it('should favor remote branches in bare repository', async () => {
    const remoteRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true, remote: true })
    await initRepoWithFiles(remoteRepoBuilder, { repoName: 'the-component-remote' })

    const localRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true })
    await initRepoWithFiles(localRepoBuilder, { repoName: 'the-component-local' }, undefined, async () =>
      localRepoBuilder
        .addToWorktree('modules/ROOT/pages/page-one.adoc', '= Local Modification')
        .then(() => localRepoBuilder.commitAll('make modification'))
        .then(() => localRepoBuilder.addRemote('origin', remoteRepoBuilder.url))
    )

    playbookSpec.content.sources.push({ url: localRepoBuilder.url })

    const aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    const pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(pageOne).to.exist()
    expect(pageOne.contents.toString()).to.not.have.string('= Local Modification')
  })

  it('should discover components in specified remote', async () => {
    const remoteRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true, remote: true })
    const remoteComponentDesc = {
      repoName: 'the-component-remote',
      name: 'the-component',
      version: 'v2.0',
    }
    // NOTE master branch in remote will get shadowed
    await initRepoWithFiles(remoteRepoBuilder, remoteComponentDesc, undefined, async () =>
      remoteRepoBuilder.checkoutBranch('v2.0')
    )

    const localRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
    await initRepoWithFiles(localRepoBuilder, { repoName: 'the-component-local' }, undefined, async () =>
      localRepoBuilder.addRemote('upstream', remoteRepoBuilder.url)
    )

    playbookSpec.content.sources.push({ url: localRepoBuilder.url, remote: 'upstream' })

    const aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(2)
    expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
  })

  // technically, we don't know what it did w/ the remote we specified, but it should work regardless
  it('should ignore remote if cloned', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true, remote: true })
    await initRepoWithFiles(repoBuilder)

    playbookSpec.content.sources.push({ url: repoBuilder.url, remote: 'upstream' })

    const aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
  })

  it('should throw meaningful error if local relative content directory does not exist', async () => {
    const invalidDir = 'no-such-directory'
    const invalidAbsDir = ospath.join(WORK_DIR, 'no-such-directory')
    playbookSpec.dir = WORK_DIR
    playbookSpec.content.sources.push({ url: invalidDir })
    const expectedErrorMessage =
      'Local content source does not exist: ' + invalidAbsDir + ' (resolved from url: ' + invalidDir + ')'
    const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
    expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
  })

  it('should throw meaningful error if local absolute content directory does not exist', async () => {
    const invalidAbsDir = ospath.join(WORK_DIR, 'no-such-directory')
    playbookSpec.content.sources.push({ url: invalidAbsDir })
    const expectedErrorMessage = 'Local content source does not exist: ' + invalidAbsDir
    const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
    expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
  })

  it('should throw meaningful error if local relative content directory is not a git repository', async () => {
    const regularDir = 'regular-directory'
    const regularAbsDir = ospath.join(WORK_DIR, regularDir)
    fs.ensureDirSync(regularAbsDir)
    fs.writeFileSync(ospath.join(regularAbsDir, 'antora.xml'), 'name: the-component\nversion: 1.0')
    playbookSpec.dir = WORK_DIR
    playbookSpec.content.sources.push({ url: regularDir })
    const expectedErrorMessage =
      'Local content source must be a git repository: ' + regularAbsDir + ' (resolved from url: ' + regularDir + ')'
    const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
    expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
  })

  it('should throw meaningful error if local absolute content directory is not a git repository', async () => {
    const regularAbsDir = ospath.join(WORK_DIR, 'regular-directory')
    fs.ensureDirSync(regularAbsDir)
    fs.writeFileSync(ospath.join(regularAbsDir, 'antora.xml'), 'name: the-component\nversion: 1.0')
    playbookSpec.content.sources.push({ url: regularAbsDir })
    const expectedErrorMessage = 'Local content source must be a git repository: ' + regularAbsDir
    const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
    expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
  })
})
