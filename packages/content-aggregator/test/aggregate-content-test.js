/* eslint-env mocha */
'use strict'

const { deferExceptions, expect, heredoc, removeSyncForce, spy } = require('../../../test/test-utils')

const aggregateContent = require('@antora/content-aggregator')
const computeOrigin = aggregateContent._computeOrigin
const { createHash } = require('crypto')
const freeze = require('deep-freeze-node')
const fs = require('fs-extra')
const getCacheDir = require('cache-directory')
const GitServer = require('node-git-server')
const http = require('http')
const os = require('os')
const ospath = require('path')
const { Readable } = require('stream')
const RepositoryBuilder = require('../../../test/repository-builder')

const {
  COMPONENT_DESC_FILENAME,
  CONTENT_CACHE_FOLDER,
  GIT_CORE,
  GIT_OPERATION_LABEL_LENGTH,
} = require('@antora/content-aggregator/lib/constants')
const CACHE_DIR = getCacheDir('antora-test')
const CONTENT_CACHE_DIR = ospath.join(CACHE_DIR, CONTENT_CACHE_FOLDER)
const CONTENT_REPOS_DIR = ospath.join(__dirname, 'content-repos')
const CWD = process.cwd()
const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')
const WORK_DIR = ospath.join(__dirname, 'work')

// FIXME figure out a way to avoid having to use a global here
let gitServerPort

function testAll (testBlock, numRepoBuilders = 1, remoteBare = undefined) {
  const makeTest = (repoBuilderOpts) => {
    const repoBuilders = Array.from(
      { length: numRepoBuilders },
      () => new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, repoBuilderOpts)
    )
    return testBlock(...repoBuilders)
  }

  it('on local repo', () => makeTest())
  it('on local bare repo', () => makeTest({ bare: true }))
  it('on remote repo', () => makeTest({ remote: { gitServerPort } }))
  if (remoteBare) it('on remote bare repo', () => makeTest({ bare: true, remote: { gitServerPort } }))
}

function testLocal (block) {
  it('on local repo', () => block(new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)))
}

function testRemote (block) {
  it('on remote repo', () =>
    block(new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })))
}

describe('aggregateContent()', function () {
  let playbookSpec
  let gitServer

  const initRepoWithFiles = async (repoBuilder, componentDesc, paths, beforeClose) => {
    let repoName
    if (componentDesc && 'repoName' in componentDesc) {
      repoName = componentDesc.repoName
      delete componentDesc.repoName
    }
    if (!componentDesc || !Object.keys(componentDesc).length) {
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

  const prefixPath = (prefix, path_) => [prefix, path_].join(ospath.sep)

  const clean = (fin) => {
    process.chdir(CWD)
    removeSyncForce(CACHE_DIR)
    removeSyncForce(CONTENT_REPOS_DIR)
    removeSyncForce(WORK_DIR)
    if (!fin) {
      fs.ensureDirSync(WORK_DIR)
      process.chdir(WORK_DIR)
    }
  }

  const withMockStdout = async (testBlock, columns = 120, isTTY = true) => {
    const defaultStdout = 'clearLine columns cursorTo isTTY moveCursor write'.split(' ').reduce((accum, name) => {
      accum[name] = process.stdout[name]
      return accum
    }, {})
    try {
      const lines = []
      Object.assign(process.stdout, {
        clearLine: spy(() => {}),
        columns,
        cursorTo: spy(() => {}),
        isTTY,
        moveCursor: spy(() => {}),
        write: (line) => /\[(?:clone|fetch)\]/.test(line) && lines.push(line),
      })
      await testBlock(lines)
    } finally {
      Object.assign(process.stdout, defaultStdout)
    }
  }

  before(async () => {
    gitServerPort = await new Promise((resolve, reject) =>
      (gitServer = new GitServer(CONTENT_REPOS_DIR, { autoCreate: false })).listen(0, function (err) {
        err ? reject(err) : resolve(this.address().port)
      })
    )
  })

  beforeEach(() => {
    playbookSpec = {
      runtime: { quiet: true },
      content: {
        sources: [],
        branches: ['v*', 'master'],
      },
    }
    clean()
  })

  after(async () => {
    await new Promise((resolve, reject) => gitServer.server.close((err) => (err ? reject(err) : resolve())))
    clean(true)
  })

  describe('read component descriptor', () => {
    const initRepoWithComponentDescriptor = async (repoBuilder, componentDesc, beforeClose) => {
      let repoName
      if ('repoName' in componentDesc) {
        repoName = componentDesc.repoName
        delete componentDesc.repoName
      } else {
        repoName = componentDesc.name
      }
      return repoBuilder
        .init(repoName)
        .then(() => repoBuilder.addComponentDescriptor(componentDesc))
        .then(() => beforeClose && beforeClose())
        .then(() => repoBuilder.close())
    }

    describe('should load component descriptor then remove file from aggregate', () => {
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

    describe('should camelCase keys in component descriptor', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          display_version: '1.2.3',
          start_page: 'home.adoc',
        }
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.have.property('displayVersion', '1.2.3')
        expect(aggregate[0]).to.have.property('startPage', 'home.adoc')
      })
    })

    describe('should throw if component descriptor cannot be found', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await repoBuilder.init('the-component').then(() => repoBuilder.close())
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const expectedMessage = `${COMPONENT_DESC_FILENAME} not found in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if component descriptor cannot be parsed', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: 'v1.0' }, () =>
          repoBuilder
            .addToWorktree('antora.yml', ':\nname: the-component\nversion: v1.0\n')
            .then(() => repoBuilder.commitAll('mangle component descriptor'))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const expectedMessageStart = `${COMPONENT_DESC_FILENAME} has invalid syntax;`
        const expectedMessageEnd = ` in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessageStart)
        expect(aggregateContentDeferred).to.throw(expectedMessageEnd)
      })
    })

    describe('should throw if component descriptor does not define a name', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { version: 'v1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const expectedMessage = `${COMPONENT_DESC_FILENAME} is missing a name in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if component descriptor does not define a version', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const expectedMessage = `${COMPONENT_DESC_FILENAME} is missing a version in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if name defined in component descriptor contains a path segment', () => {
      testLocal(async (repoBuilder) => {
        const ref = 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'foo/bar', version: 'v1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const expectedMessage =
          `name in ${COMPONENT_DESC_FILENAME} cannot have path segments: foo/bar` +
          ` in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if version defined in component descriptor contains a path segment', () => {
      testLocal(async (repoBuilder) => {
        const ref = 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: '1.1/0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const expectedMessage =
          `version in ${COMPONENT_DESC_FILENAME} cannot have path segments: 1.1/0` +
          ` in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should coerce name in component descriptor to string', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithComponentDescriptor(repoBuilder, { repoName: 'the-component', name: 10, version: '1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: '10', version: '1.0' })
      })
    })

    describe('should coerce version in component descriptor to string', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: 27 })
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: '27' })
      })
    })

    describe('should read component descriptor located at specified start path', () => {
      testAll(async (repoBuilder) => {
        const startPath = 'path/to/docs'
        const componentDesc = {
          name: 'the-component',
          title: 'Component Title',
          version: '1.0',
          nav: ['nav-start.adoc', 'nav-end.adoc'],
          startPath,
        }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should throw if component descriptor at start path cannot be parsed', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        const componentDesc = { name: 'the-component', version: 'v1.0', startPath: 'docs' }
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder
            .addToWorktree('docs/antora.yml', ':\nname: the-component\nversion: v1.0\n')
            .then(() => repoBuilder.commitAll('mangle component descriptor'))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: 'docs' })
        const expectedMessageStart = `${COMPONENT_DESC_FILENAME} has invalid syntax;`
        const expectedMessageEnd = ` in ${repoBuilder.url} (ref: ${ref} | path: docs)`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessageStart)
        expect(aggregateContentDeferred).to.throw(expectedMessageEnd)
      })
    })

    describe('should ignore leading, trailing, and repeating slashes in start path value', () => {
      testAll(async (repoBuilder) => {
        const startPath = 'path/to/docs'
        const mangledStartPath = '/path//to/docs/'
        const componentDesc = { name: 'the-component', title: 'Component Title', version: '1.0', startPath }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: mangledStartPath })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should read component descriptor located at exact start paths', () => {
      testAll(async (repoBuilder) => {
        const startPath = 'path/to/docs'
        const componentDesc = {
          name: 'the-component',
          title: 'Component Title',
          version: '1.0',
          nav: ['nav-start.adoc', 'nav-end.adoc'],
          startPath,
        }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: [startPath] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should ignore leading, trailing, and repeating slashes in start paths', () => {
      testAll(async (repoBuilder) => {
        const startPath = 'path/to/docs'
        const mangledStartPath = '/path//to/docs/'
        const componentDesc = { name: 'the-component', title: 'Component Title', version: '1.0', startPath }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: [mangledStartPath] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should resolve start path from wildcard pattern', () => {
      testAll(async (repoBuilder) => {
        const startPath = 'docs'
        const componentDesc = { name: 'the-component', title: 'Component Title', version: '1.0', startPath }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: 'doc*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should read component descriptors located at start paths specified as CSV string', () => {
      testAll(async (repoBuilder) => {
        const startPath1 = 'docs'
        const startPath2 = 'moredocs'
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: '1', startPath: startPath1 }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: '2', startPath: startPath2 }
        let componentDescEntry1
        let componentDescEntry2
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry(startPath1 + '/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry(startPath2 + '/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: [startPath1, startPath2].join(', ') })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.deep.include(componentDesc1)
        expect(aggregate[1]).to.deep.include(componentDesc2)
      })
    })

    describe('should read component descriptors located at start paths specified as array', () => {
      testAll(async (repoBuilder) => {
        const startPath1 = 'docs'
        const startPath2 = 'more/docs'
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: '1', startPath: startPath1 }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: '2', startPath: startPath2 }
        let componentDescEntry1
        let componentDescEntry2
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry(startPath1 + '/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry(startPath2 + '/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: [startPath1, startPath2] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.deep.include(componentDesc1)
        expect(aggregate[1]).to.deep.include(componentDesc2)
      })
    })

    describe('should read component descriptors located at start paths specified as brace pattern', () => {
      testAll(async (repoBuilder) => {
        const startPath1 = 'docs'
        const startPath2 = 'moredocs'
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: '1', startPath: startPath1 }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: '2', startPath: startPath2 }
        let componentDescEntry1
        let componentDescEntry2
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry(startPath1 + '/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry(startPath2 + '/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: `{${startPath1},${startPath2}}` })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.deep.include(componentDesc1)
        expect(aggregate[1]).to.deep.include(componentDesc2)
      })
    })

    describe('should read component descriptors at start paths specified as nested brace patterns', () => {
      testAll(async (repoBuilder) => {
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: '1', startPath: 'docs' }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: '2', startPath: 'docx' }
        const componentDesc3 = { name: 'the-component', title: 'Component Title', version: '3', startPath: 'moredocs' }
        let componentDescEntry1
        let componentDescEntry2
        let componentDescEntry3
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc3))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry('docs/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry('docx/antora.yml')
            componentDescEntry3 = await repoBuilder.findEntry('moredocs/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        expect(componentDescEntry3).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: '{doc{s,x},moredocs}' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.deep.include(componentDesc1)
        expect(aggregate[1]).to.deep.include(componentDesc2)
        expect(aggregate[2]).to.deep.include(componentDesc3)
      })
    })

    describe('should resolve start paths that follow wildcard in start paths pattern', () => {
      testAll(async (repoBuilder) => {
        const startPath1 = 'path/to/docs'
        const startPath2 = 'more/docs'
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: '1', startPath: startPath1 }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: '2', startPath: startPath2 }
        let componentDescEntry1
        let componentDescEntry2
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry(startPath1 + '/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry(startPath2 + '/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        const startPaths = ['path/*/docs', '*/docs', '*/dne', '*/{does-,}not-exist']
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.deep.include(componentDesc1)
        expect(aggregate[1]).to.deep.include(componentDesc2)
      })
    })

    describe('should not read component descriptors located at start paths that have been excluded', () => {
      testAll(async (repoBuilder) => {
        const startPath1 = 'docs'
        const startPath2 = 'more/docs'
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: '1', startPath: startPath1 }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: '2', startPath: startPath2 }
        let componentDescEntry1
        let componentDescEntry2
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry(startPath1 + '/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry(startPath2 + '/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: '*docs*, !more*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc1)
      })
    })

    describe('should read component descriptors located at start paths in each reference', () => {
      testAll(async (repoBuilder) => {
        const componentDesc1v1 = { name: 'component-a', title: 'Component A', version: '1', startPath: 'docs' }
        const componentDesc1v2 = { name: 'component-a', title: 'Component A', version: '2', startPath: 'docs' }
        const componentDesc2v8 = { name: 'component-b', title: 'Component B', version: '8', startPath: 'moredocs' }
        const componentDesc2v9 = { name: 'component-b', title: 'Component B', version: '9', startPath: 'moredocs' }
        let componentDescEntry1v1
        let componentDescEntry1v2
        let componentDescEntry2v8
        let componentDescEntry2v9
        await repoBuilder
          .init('hybrid')
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1v1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2v8))
          .then(async () => {
            componentDescEntry1v1 = await repoBuilder.findEntry('docs/antora.yml')
            componentDescEntry2v8 = await repoBuilder.findEntry('moredocs/antora.yml')
          })
          .then(() => repoBuilder.checkoutBranch('other'))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1v2))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2v9))
          .then(async () => {
            componentDescEntry1v2 = await repoBuilder.findEntry('docs/antora.yml')
            componentDescEntry2v9 = await repoBuilder.findEntry('moredocs/antora.yml')
          })
          .then(() => repoBuilder.close('master'))
        expect(componentDescEntry1v1).to.exist()
        expect(componentDescEntry1v2).to.exist()
        expect(componentDescEntry2v8).to.exist()
        expect(componentDescEntry2v9).to.exist()
        playbookSpec.content.sources.push({
          url: repoBuilder.url,
          branches: ['master', 'other'],
          startPaths: ['docs', 'moredocs'],
        })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(4)
        expect(aggregate[0]).to.deep.include(componentDesc1v1)
        expect(aggregate[1]).to.deep.include(componentDesc1v2)
        expect(aggregate[2]).to.deep.include(componentDesc2v8)
        expect(aggregate[3]).to.deep.include(componentDesc2v9)
      })
    })

    describe('should throw if start path is not found', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: '1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: 'does-not-exist' })
        const expectedMessage = `the start path 'does-not-exist' does not exist in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if start path at reference is not a directory', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: '1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: 'antora.yml' })
        const expectedMessage = `the start path 'antora.yml' is not a directory in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if component descriptor cannot be found at start path', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithFiles(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: 'modules' })
        const expectedMessage = `${COMPONENT_DESC_FILENAME} not found in ${repoBuilder.url} (ref: ${ref} | path: modules)`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if a start path specified in a brace pattern does not exist', () => {
      testAll(async (repoBuilder) => {
        const startPath = 'docs'
        const componentDesc = { name: 'the-component', title: 'Component Title', version: '1.0', startPath }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: '{more,}docs' })
        const expectedMessage = `the start path 'moredocs' does not exist in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should throw if no start paths are resolved', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: '1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: 'does-not-exist-*' })
        const expectedMessage = `no start paths found in ${repoBuilder.url} (ref: ${ref})`
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should retain unresolved segments in start path if parent directory does not exist', () => {
      testAll(async (repoBuilder) => {
        const ref = repoBuilder.remote ? 'remotes/origin/master' : repoBuilder.bare ? 'master' : 'master <worktree>'
        await initRepoWithComponentDescriptor(repoBuilder, { name: 'the-component', version: '1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: 'does-not-exist/{foo,bar*}' })
        const expectedMessage = new RegExp(
          "^the start path 'does-not-exist/(foo|bar\\*)' does not exist in " +
            `${repoBuilder.url} (ref: ${ref})$`.replace(/[.()\\]/g, '\\$&')
        )
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedMessage)
      })
    })

    describe('should coerce value of start path to string', () => {
      testAll(async (repoBuilder) => {
        const startPath = '10'
        const componentDesc = { name: 'the-component', title: 'Component', version: 'v10', startPath }
        let componentDescEntry
        await initRepoWithComponentDescriptor(repoBuilder, componentDesc, () =>
          repoBuilder.findEntry(startPath + '/antora.yml').then((entry) => (componentDescEntry = entry))
        )
        expect(componentDescEntry).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: parseInt(startPath) })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.deep.include(componentDesc)
      })
    })

    describe('should coerce value of each start path to string', () => {
      testAll(async (repoBuilder) => {
        const componentDesc1 = { name: 'the-component', title: 'Component Title', version: 'v10', startPath: '10' }
        const componentDesc2 = { name: 'the-component', title: 'Component Title', version: 'v20', startPath: 'true' }
        let componentDescEntry1
        let componentDescEntry2
        await repoBuilder
          .init(componentDesc1.name)
          .then(() => repoBuilder.addComponentDescriptor(componentDesc1))
          .then(() => repoBuilder.addComponentDescriptor(componentDesc2))
          .then(async () => {
            componentDescEntry1 = await repoBuilder.findEntry('10/antora.yml')
            componentDescEntry2 = await repoBuilder.findEntry('true/antora.yml')
          })
          .then(() => repoBuilder.close())
        expect(componentDescEntry1).to.exist()
        expect(componentDescEntry2).to.exist()
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPaths: [10, true] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.deep.include(componentDesc1)
        expect(aggregate[1]).to.deep.include(componentDesc2)
      })
    })

    describe('should discover different components across multiple repositories', () => {
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

    // FIXME this test may change if we modify the rules for merging component descriptors
    describe('should discover the same component version across multiple repositories', () => {
      testAll(async (repoBuilderA1, repoBuilderA2) => {
        const componentDescA1 = { name: 'the-component', title: 'The Component', version: 'v1.2' }
        await initRepoWithComponentDescriptor(repoBuilderA1, componentDescA1)
        playbookSpec.content.sources.push({ url: repoBuilderA1.url })

        const componentDescA2 = { name: 'the-component', version: 'v1.2', prerelease: true }
        await initRepoWithComponentDescriptor(repoBuilderA2, componentDescA2)
        playbookSpec.content.sources.push({ url: repoBuilderA2.url })

        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        // NOTE the keys of the two component descriptors are merged, last wins
        expect(aggregate[0]).to.include({ ...componentDescA1, ...componentDescA2 })
      }, 2)
    })

    it('should resolve relative repository path starting from cwd', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      playbookSpec.dir = WORK_DIR
      playbookSpec.content.sources.push({ url: ospath.relative(newWorkDir, repoBuilder.url) })
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include(componentDesc)
    })

    it('should resolve dot-relative repository path starting from playbook dir if set', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      playbookSpec.content.sources.push({ url: prefixPath('.', ospath.relative(WORK_DIR, repoBuilder.url)) })
      playbookSpec.dir = WORK_DIR
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include(componentDesc)
    })

    it('should resolve dot-relative repository path start from cwd if playbook dir not set', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      playbookSpec.content.sources.push({ url: prefixPath('.', ospath.relative(WORK_DIR, repoBuilder.url)) })
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include(componentDesc)
    })

    it('should expand leading ~ segment in local repository path to user home', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      playbookSpec.content.sources.push({ url: prefixPath('~', ospath.relative(os.homedir(), repoBuilder.url)) })
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include(componentDesc)
    })

    it('should expand leading ~+ segment in repository path to cwd', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const componentDesc = {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
      }
      await initRepoWithComponentDescriptor(repoBuilder, componentDesc)
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      playbookSpec.dir = WORK_DIR
      playbookSpec.content.sources.push({ url: prefixPath('~+', ospath.relative(newWorkDir, repoBuilder.url)) })
      let aggregate
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(() => (aggregate = aggregateContentDeferred())).to.not.throw()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include(componentDesc)
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
      expect(aggregate[0]).to.include(componentDesc)
    })
  })

  describe('filter refs', () => {
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

    describe('should exclude all branches when global filter is undefined', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(0)
      })
    })

    describe('should exclude all branches when filter on content source is undefined', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: undefined })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(0)
      })
    })

    describe('should filter branches by exact name', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'master' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
      })
    })

    describe('should select a branch that matches a numeric value', () => {
      testAll(async (repoBuilder) => {
        const componentName = 'the-component'
        await initRepoWithBranches(repoBuilder, componentName, () =>
          repoBuilder
            .checkoutBranch('5.6')
            .then(() => repoBuilder.addComponentDescriptor({ name: componentName, version: '5.6' }))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 5.6 })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: componentName, version: '5.6' })
      })
    })

    describe('should not inadvertently select a branch named push', () => {
      testAll(async (repoBuilder) => {
        const componentName = 'the-component'
        await initRepoWithBranches(repoBuilder, componentName, () =>
          repoBuilder
            .checkoutBranch('push')
            .then(() => repoBuilder.addComponentDescriptor({ name: componentName, version: 'push' }))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v1.0' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: componentName, version: 'v1.0' })
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

    describe('should filter branches using multiple filters passed as array', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({
          url: repoBuilder.url,
          branches: ['master', 'v1*', 'v3.*', 5.6],
        })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should filter branches using multiple filters passed as CSV string', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({
          url: repoBuilder.url,
          branches: 'master,v1* , v3.*',
        })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should apply branch exclusion filter', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({
          url: repoBuilder.url,
          branches: ['v*', '!master', '!v2*'],
        })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should only use branches when only branches are specified', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () => repoBuilder.createTag('v1.0.0', 'v1.0'))
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
        freeze(playbookSpec)
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
        freeze(playbookSpec)
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
        freeze(playbookSpec)
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
        freeze(playbookSpec)
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should select current branch if CSV pattern includes HEAD', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.close('v3.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'master,HEAD' })
        freeze(playbookSpec)
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should select current branch if CSV pattern includes .', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.close('v3.0'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'master,.' })
        freeze(playbookSpec)
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should use worktree for HEAD if not on branch', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
          .then(() => repoBuilder.open())
          .then(() => repoBuilder.checkoutBranch('v3.0'))
          .then(() => repoBuilder.detachHead())
          .then(() => repoBuilder.close())
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: ['HEAD', 'v1.0', 'v2.0'] })
        freeze(playbookSpec)
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })

      it('should only select branch once if both HEAD and current branch name are listed', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithBranches(repoBuilder)
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: ['HEAD', 'master'] })
        freeze(playbookSpec)
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
      })
    })

    describe('should filter tags using wildcard', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('z3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: 'v*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
      })
    })

    describe('should filter tags using exact name', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: 'v2.0.0' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v2.0' })
      })
    })

    describe('should select a tag that matches a numeric value', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () => repoBuilder.createTag('1', 'v1.0'))
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: 1 })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
      })
    })

    describe('should filter tags using multiple filters passed as array', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('1', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: [1, 'v3.*'] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should filter tags using multiple filters passed as CSV string', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: 'v1.0.0 , v3.*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should exclude all refs if filter matches no tags', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = undefined
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: 'z*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(0)
      })
    })

    describe('should filter tags using default filter as string', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = []
        playbookSpec.content.tags = 'v2.*'
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v2.0' })
      })
    })

    describe('should filter tags using default filter as array', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = []
        playbookSpec.content.tags = ['v1.*', 'v3.0.0']
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    describe('should exclude all refs if filter on content source is undefined', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.branches = undefined
        playbookSpec.content.tags = 'v*'
        playbookSpec.content.sources.push({ url: repoBuilder.url, tags: undefined })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(0)
      })
    })

    describe('should filter both branches and tags', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithBranches(repoBuilder, 'the-component', () =>
          repoBuilder
            .createTag('v1.0.0', 'v1.0')
            .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
            .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: ['v3.*'], tags: ['v*', '!v3.*'] })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(3)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
        expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
        expect(aggregate[2]).to.include({ name: 'the-component', version: 'v3.0' })
      })
    })

    it('should select tags even when branches filter is HEAD', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      await initRepoWithBranches(repoBuilder, 'the-component', () =>
        repoBuilder
          .createTag('v1.0.0', 'v1.0')
          .then(() => repoBuilder.createTag('v2.0.0', 'v2.0'))
          .then(() => repoBuilder.createTag('v3.0.0', 'v3.0'))
      )
      await repoBuilder
        .open()
        .then(() => repoBuilder.detachHead())
        .then(() => repoBuilder.close())
      playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'HEAD', tags: 'v3*' })
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(2)
      expect(aggregate[0]).to.include({ name: 'the-component', version: 'latest-and-greatest' })
      expect(aggregate[1]).to.include({ name: 'the-component', version: 'v3.0' })
    })
  })

  describe('aggregate files from repository', () => {
    describe('should aggregate all files in branch', () => {
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
        if (repoBuilder.bare || repoBuilder.remote) {
          files.forEach((file) => expect(file.stat.mtime).to.be.undefined())
        } else {
          files.forEach((file) => {
            expect(file.stat.mtime).not.to.be.undefined()
            expect(file.stat.mtime.getTime()).not.to.be.NaN()
          })
        }
      })
    })

    describe('should aggregate all files in annotated tag', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: '1.0' }
        const paths = ['modules/ROOT/pages/page-one.adoc', 'modules/ROOT/pages/page-two.adoc']
        await repoBuilder
          .init(componentDesc.name)
          .then(() => repoBuilder.checkoutBranch('v1.0.x'))
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.addFilesFromFixture(paths))
          .then(() => repoBuilder.createTag('v1.0.0'))
          .then(() => repoBuilder.close('master'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: [], tags: 'v*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include(componentDesc)
        const files = componentVersion.files
        expect(files).to.have.lengthOf(paths.length)
        files.forEach((file) => expect(file.stat.isFile()).to.be.true())
        files.forEach((file) => expect(file).to.have.nested.property('src.origin.tag', 'v1.0.0'))
      })
    })

    describe('should aggregate all files in lightweight tag', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: '1.0' }
        const paths = ['modules/ROOT/pages/page-one.adoc', 'modules/ROOT/pages/page-two.adoc']
        await repoBuilder
          .init(componentDesc.name)
          .then(() => repoBuilder.checkoutBranch('v1.0.x'))
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.addFilesFromFixture(paths))
          .then(() => repoBuilder.createTag('v1.0.0', 'HEAD', false))
          .then(() => repoBuilder.close('master'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: [], tags: 'v*' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const componentVersion = aggregate[0]
        expect(componentVersion).to.include(componentDesc)
        const files = componentVersion.files
        expect(files).to.have.lengthOf(paths.length)
        files.forEach((file) => expect(file.stat.isFile()).to.be.true())
        files.forEach((file) => expect(file).to.have.nested.property('src.origin.tag', 'v1.0.0'))
      })
    })

    // NOTE in the future, files in the worktree of a local repo may get picked up in this scenario
    describe('should handle repository with no commits as expected', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.0' }
        await repoBuilder
          .init(componentDesc.name, { empty: true })
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.copyToWorktree(['modules/ROOT/pages/page-one.adoc'], repoBuilder.fixtureBase))
          .then(() => repoBuilder.close())
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'HEAD' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(0)
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

    describe('should set file mode of regular file read from git repository to correct value', () => {
      testAll(async (repoBuilder) => {
        const fixturePath = 'modules/ROOT/pages/page-one.adoc'
        await initRepoWithFiles(repoBuilder, {}, fixturePath, () => {
          return repoBuilder
            .checkoutBranch('v2.0')
            .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v2.0' }))
            .then(() => repoBuilder.commitAll())
            .then(() => repoBuilder.checkoutBranch('master'))
        })
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })
        const expectedMode = 0o100666 & ~process.umask()
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v2.0' })
        const fixtureFile = aggregate[0].files.find((file) => file.path === fixturePath)
        expect(fixtureFile).to.exist()
        if (!(repoBuilder.bare || repoBuilder.remote)) {
          expect(fixtureFile.src.origin.worktree).to.be.undefined()
        }
        expect(fixtureFile.stat.mode).to.equal(expectedMode)
      })
    })

    it('should set file mode of regular file read from worktree to correct value', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const fixturePath = 'modules/ROOT/pages/page-one.adoc'
      await initRepoWithFiles(repoBuilder, {}, fixturePath)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const expectedMode = (await fs.stat(ospath.join(repoBuilder.repoPath, fixturePath))).mode
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
      const fixtureFile = aggregate[0].files.find((file) => file.path === fixturePath)
      expect(fixtureFile).to.exist()
      expect(fixtureFile.src.origin.worktree).to.be.true()
      expect(fixtureFile.stat.mode).to.equal(expectedMode)
    })

    describe('should set file mode of executable file read from git repository to correct value', () => {
      testAll(async (repoBuilder) => {
        const fixturePath = 'modules/ROOT/assets/attachments/installer.sh'
        await initRepoWithFiles(repoBuilder, {}, fixturePath, () => {
          return repoBuilder
            .checkoutBranch('v2.0')
            .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v2.0' }))
            .then(() => repoBuilder.commitAll())
            .then(() => repoBuilder.checkoutBranch('master'))
        })
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })
        // NOTE Windows doesn't support setting executable bit on file (and can't current emulate in git server)
        const expectedMode = (process.platform === 'win32' ? 0o100666 : 0o100777) & ~process.umask()
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v2.0' })
        const fixtureFile = aggregate[0].files.find((file) => file.path === fixturePath)
        expect(fixtureFile).to.exist()
        if (!(repoBuilder.bare || repoBuilder.remote)) {
          expect(fixtureFile.src.origin.worktree).to.be.undefined()
        }
        expect(fixtureFile.stat.mode).to.equal(expectedMode)
      })
    })

    it('should set file mode of executable file read from worktree to correct value', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      const fixturePath = 'modules/ROOT/assets/attachments/installer.sh'
      await initRepoWithFiles(repoBuilder, {}, fixturePath)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const expectedMode = (await fs.stat(ospath.join(repoBuilder.repoPath, fixturePath))).mode
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
      const fixtureFile = aggregate[0].files.find((file) => file.path === fixturePath)
      expect(fixtureFile).to.exist()
      expect(fixtureFile.src.origin.worktree).to.be.true()
      expect(fixtureFile.stat.mode).to.equal(expectedMode)
    })

    if (process.platform !== 'win32') {
      describe('should ignore symlinks read from git repository', () => {
        testAll(async (repoBuilder) => {
          const targetPath = 'modules/ROOT/pages/page-one.adoc'
          const symlinkPath = 'modules/ROOT/pages/page-one-link.adoc'
          const fixturePaths = [targetPath, symlinkPath]
          await initRepoWithFiles(repoBuilder, {}, fixturePaths, () => repoBuilder.checkoutBranch('other'))
          playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'master' })
          const aggregate = await aggregateContent(playbookSpec)
          expect(aggregate).to.have.lengthOf(1)
          expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
          const symlinkPage = aggregate[0].files.find((file) => file.path === symlinkPath)
          expect(symlinkPage).to.not.exist()
        })
      })

      it('should resolve symlinks read from worktree', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        const targetPath = 'modules/ROOT/pages/page-one.adoc'
        const symlinkPath = 'modules/ROOT/pages/page-one-link.adoc'
        const fixturePaths = [targetPath, symlinkPath]
        await initRepoWithFiles(repoBuilder, {}, fixturePaths)
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'master' })
        const expectedMode = (await fs.stat(ospath.join(repoBuilder.repoPath, targetPath))).mode
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const symlinkPage = aggregate[0].files.find((file) => file.path === symlinkPath)
        expect(symlinkPage).to.exist()
        expect(symlinkPage.symlink).to.not.exist()
        expect(symlinkPage.stat.mode).to.equal(expectedMode)
      })
    }

    describe('should clone repository into cache folder', () => {
      testAll(
        async (repoBuilder) => {
          await initRepoWithFiles(repoBuilder)
          if (repoBuilder.remote && repoBuilder.bare) repoBuilder.url += '/.git'
          playbookSpec.content.sources.push({ url: repoBuilder.url })
          await aggregateContent(playbookSpec)
          if (repoBuilder.remote) {
            const normalizedUrl = repoBuilder.url
              .toLowerCase()
              .replace(/\\/g, '/')
              .replace(/(?:(?:(?:\.git)?\/)?\.git|\/)$/, '')
            const hash = createHash('sha1')
            hash.update(normalizedUrl)
            const repoDir = `${ospath.basename(normalizedUrl)}-${hash.digest('hex')}.git`
            expect(CONTENT_CACHE_DIR).to.be.a.directory()
            expect(ospath.join(CONTENT_CACHE_DIR, repoDir))
              .to.be.a.directory()
              .and.include.files(['HEAD'])
          } else {
            expect(CONTENT_CACHE_DIR)
              .to.be.a.directory()
              .and.be.empty()
          }
        },
        1,
        true
      )
    })

    describe('should use custom cache dir relative to cwd', () => {
      testAll(async (repoBuilder) => {
        const customCacheDir = ospath.join(WORK_DIR, '.antora-cache')
        const customContentCacheDir = ospath.join(customCacheDir, CONTENT_CACHE_FOLDER)
        await initRepoWithFiles(repoBuilder)
        playbookSpec.runtime.cacheDir = '.antora-cache'
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        await aggregateContent(playbookSpec)
        expect(CONTENT_CACHE_DIR).to.not.be.a.path()
        if (repoBuilder.remote) {
          expect(customContentCacheDir)
            .to.be.a.directory()
            .and.not.be.empty()
        } else {
          expect(customContentCacheDir)
            .to.be.a.directory()
            .and.be.empty()
        }
      })
    })

    describe('should use custom cache dir relative to directory of playbook file', () => {
      testAll(async (repoBuilder) => {
        process.chdir(CWD)
        const customCacheDir = ospath.join(WORK_DIR, '.antora-cache')
        const customContentCacheDir = ospath.join(customCacheDir, CONTENT_CACHE_FOLDER)
        await initRepoWithFiles(repoBuilder)
        playbookSpec.dir = WORK_DIR
        playbookSpec.runtime.cacheDir = './.antora-cache'
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        await aggregateContent(playbookSpec)
        expect(CONTENT_CACHE_DIR).to.not.be.a.path()
        if (repoBuilder.remote) {
          expect(customContentCacheDir)
            .to.be.a.directory()
            .and.not.be.empty()
        } else {
          expect(customContentCacheDir)
            .to.be.a.directory()
            .and.be.empty()
        }
      })
    })

    describe('should use custom cache dir relative to user home', () => {
      testAll(async (repoBuilder) => {
        process.chdir(CWD)
        const customCacheDir = ospath.join(WORK_DIR, '.antora-cache')
        const customContentCacheDir = ospath.join(customCacheDir, CONTENT_CACHE_FOLDER)
        await initRepoWithFiles(repoBuilder)
        playbookSpec.runtime.cacheDir = prefixPath(
          '~',
          ospath.relative(os.homedir(), ospath.join(WORK_DIR, '.antora-cache'))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        await aggregateContent(playbookSpec)
        expect(CONTENT_CACHE_DIR).to.not.be.a.path()
        if (repoBuilder.remote) {
          expect(customContentCacheDir)
            .to.be.a.directory()
            .and.not.be.empty()
        } else {
          expect(customContentCacheDir)
            .to.be.a.directory()
            .and.be.empty()
        }
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
        await initRepoWithFiles(repoBuilder, {}, undefined, () => repoBuilder.addFilesFromFixture(fixturePaths))
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
        await initRepoWithFiles(repoBuilder, componentDesc, fixturePaths, () =>
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
        await initRepoWithFiles(repoBuilder, componentDesc, fixturePaths, () =>
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

    describe('should assign correct properties to virtual files taken from root of repository', () => {
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
            branch: 'master',
            startPath: '',
          },
        }
        if (repoBuilder.remote) expectedFileSrc.origin.url = repoBuilder.url
        if (!(repoBuilder.bare || repoBuilder.remote)) {
          expectedFileSrc.abspath = ospath.join(repoBuilder.repoPath, expectedFileSrc.path)
          const fileUriScheme = posixify ? 'file:///' : 'file://'
          expectedFileSrc.origin.fileUriPattern = fileUriScheme + repoBuilder.repoPath + '/%s'
          expectedFileSrc.origin.worktree = true
          expectedFileSrc.fileUri = fileUriScheme + expectedFileSrc.abspath
          if (posixify) {
            expectedFileSrc.origin.fileUriPattern = posixify(expectedFileSrc.origin.fileUriPattern)
            expectedFileSrc.fileUri = posixify(expectedFileSrc.fileUri)
          }
        }
        expect(pageOne).to.include(expectedFile)
        expect(pageOne.src).to.eql(expectedFileSrc)
      })
    })

    describe('should assign correct properties to virtual files taken from start path', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.2.3', startPath: 'docs' }
        await initRepoWithFiles(repoBuilder, componentDesc)
        playbookSpec.content.sources.push({ url: repoBuilder.url, startPath: repoBuilder.startPath })
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
            branch: 'master',
            startPath: 'docs',
          },
        }
        if (repoBuilder.remote) expectedFileSrc.origin.url = repoBuilder.url
        if (!(repoBuilder.bare || repoBuilder.remote)) {
          expectedFileSrc.abspath = ospath.join(repoBuilder.repoPath, repoBuilder.startPath, expectedFileSrc.path)
          const fileUriScheme = posixify ? 'file:///' : 'file://'
          expectedFileSrc.origin.fileUriPattern =
            fileUriScheme + ospath.join(repoBuilder.repoPath, repoBuilder.startPath, '%s')
          expectedFileSrc.origin.worktree = true
          expectedFileSrc.fileUri = fileUriScheme + expectedFileSrc.abspath
          if (posixify) {
            expectedFileSrc.origin.fileUriPattern = posixify(expectedFileSrc.origin.fileUriPattern)
            expectedFileSrc.fileUri = posixify(expectedFileSrc.fileUri)
          }
        }
        expect(pageOne).to.include(expectedFile)
        expect(pageOne.src).to.eql(expectedFileSrc)
      })
    })

    describe('should encode spaces in editUrl and fileUri', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder, undefined, 'modules/ROOT/pages/page with spaces.adoc')
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
        const actualFile = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page with spaces.adoc')
        const expectedFile = {
          path: 'modules/ROOT/pages/page with spaces.adoc',
          relative: 'modules/ROOT/pages/page with spaces.adoc',
          dirname: 'modules/ROOT/pages',
          basename: 'page with spaces.adoc',
          stem: 'page with spaces',
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
            branch: 'master',
            startPath: '',
          },
        }
        if (repoBuilder.remote) expectedFileSrc.origin.url = repoBuilder.url
        if (!(repoBuilder.bare || repoBuilder.remote)) {
          expectedFileSrc.abspath = ospath.join(repoBuilder.repoPath, expectedFileSrc.path)
          const fileUriScheme = posixify ? 'file:///' : 'file://'
          expectedFileSrc.origin.fileUriPattern = fileUriScheme + repoBuilder.repoPath + '/%s'
          expectedFileSrc.origin.worktree = true
          expectedFileSrc.fileUri = fileUriScheme + expectedFileSrc.abspath.replace(/ /g, '%20')
          if (posixify) {
            expectedFileSrc.origin.fileUriPattern = posixify(expectedFileSrc.origin.fileUriPattern)
            expectedFileSrc.fileUri = posixify(expectedFileSrc.fileUri)
          }
        }
        expect(actualFile).to.include(expectedFile)
        expect(actualFile.src).to.eql(expectedFileSrc)
      })
    })

    describe('remote origin data', () => {
      it('should resolve origin url from git config for local repository', async () => {
        const remoteUrl = 'https://gitlab.com/antora/demo/demo-component-a'
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        const fixturePath = 'modules/ROOT/pages/page-one.adoc'
        await initRepoWithFiles(repoBuilder, {}, fixturePath, () => repoBuilder.config('remote.origin.url', remoteUrl))
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const page = aggregate[0].files[0]
        expect(page).not.to.be.undefined()
        expect(page.src.origin.url).to.equal(remoteUrl)
      })

      it('should not remove .git extension from url resolved from git config for local repository', async () => {
        const remoteUrl = 'https://gitlab.com/antora/demo/demo-component-a.git'
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        const fixturePath = 'modules/ROOT/pages/page-one.adoc'
        await initRepoWithFiles(repoBuilder, {}, fixturePath, () => repoBuilder.config('remote.origin.url', remoteUrl))
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const page = aggregate[0].files[0]
        expect(page).not.to.be.undefined()
        expect(page.src.origin.url).to.equal(remoteUrl)
      })

      it('should coerce SSH URI resolved from git config for local repository to HTTPS URL', async () => {
        const remoteUrl = 'git@gitlab.com:antora/demo/demo-component-a.git'
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        const fixturePath = 'modules/ROOT/pages/page-one.adoc'
        await initRepoWithFiles(repoBuilder, {}, fixturePath, () => repoBuilder.config('remote.origin.url', remoteUrl))
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const page = aggregate[0].files[0]
        expect(page).not.to.be.undefined()
        expect(page.src.origin.url).to.equal('https://gitlab.com/antora/demo/demo-component-a.git')
      })

      it('should clean credentials from remote url retrieved from git config', async () => {
        const remoteUrl = 'https://u:p@gitlab.com/antora/demo/demo-component-a.git'
        const remoteUrlWithoutAuth = remoteUrl.replace('u:p@', '')
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        const fixturePath = 'modules/ROOT/pages/page-one.adoc'
        await initRepoWithFiles(repoBuilder, {}, fixturePath, () => repoBuilder.config('remote.origin.url', remoteUrl))
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const page = aggregate[0].files[0]
        expect(page).not.to.be.undefined()
        expect(page.src.origin.url).to.equal(remoteUrlWithoutAuth)
      })

      it('should not set origin url for local repository if remote url not set in git config', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
        await initRepoWithFiles(repoBuilder, {}, 'modules/ROOT/pages/page-one.adoc')
        playbookSpec.content.sources.push({ url: repoBuilder.url })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const page = aggregate[0].files[0]
        expect(page).not.to.be.undefined()
        expect(page.src.origin.url).to.undefined()
      })

      it('should generate correct origin data for file taken from repository on GitHub', () => {
        const urls = [
          'https://{hostname}/org-name/repo-name.git',
          'https://{hostname}/org-name/repo-name',
          'git@{hostname}:org-name/repo-name.git',
          'git@{hostname}:org-name/repo-name',
        ]
        const hostnames = ['github.com', 'private.github.com']
        const action = { branch: 'edit', tag: 'blob' }
        const refs = [['master', 'branch'], ['v1.1.0', 'tag']] // prettier-ignore
        refs.forEach(([name, type]) => {
          hostnames.forEach((hostname) => {
            urls.forEach((url) => {
              url = url.replace('{hostname}', hostname)
              const origin = computeOrigin(url, false, name, type, '')
              expect(origin.url).to.equal(url)
              expect(origin[type]).to.equal(name)
              if (hostname === 'github.com') {
                const expectedEditUrlPattern = `https://${hostname}/org-name/repo-name/${action[type]}/${name}/%s`
                expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
              } else {
                expect(origin).not.to.have.property('editUrlPattern')
              }
            })
          })
        })
      })

      it('should generate correct origin data for file taken from repository on GitLab', () => {
        const urls = [
          'https://{hostname}/org-name/repo-name.git',
          'https://{hostname}/org-name/repo-name',
          'git@{hostname}:org-name/repo-name.git',
          'git@{hostname}:org-name/repo-name',
        ]
        const hostnames = ['gitlab.com', 'private.gitlab.com']
        const action = { branch: 'edit', tag: 'blob' }
        const refs = [['master', 'branch'], ['v1.1.0', 'tag']] // prettier-ignore
        refs.forEach(([name, type]) => {
          hostnames.forEach((hostname) => {
            urls.forEach((url) => {
              url = url.replace('{hostname}', hostname)
              const origin = computeOrigin(url, false, name, type, '')
              expect(origin.url).to.equal(url)
              expect(origin[type]).to.equal(name)
              if (hostname === 'gitlab.com') {
                const expectedEditUrlPattern = `https://${hostname}/org-name/repo-name/${action[type]}/${name}/%s`
                expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
              } else {
                expect(origin).not.to.have.property('editUrlPattern')
              }
            })
          })
        })
      })

      it('should generate correct origin data for file taken from repository on BitBucket', () => {
        const urls = [
          'https://{hostname}/org-name/repo-name.git',
          'https://{hostname}/org-name/repo-name',
          'git@{hostname}:org-name/repo-name.git',
          'git@{hostname}:org-name/repo-name',
        ]
        const hostnames = ['bitbucket.org', 'private.bitbucket.org']
        const refs = [['master', 'branch'], ['v1.1.0', 'tag']] // prettier-ignore
        refs.forEach(([name, type]) => {
          hostnames.forEach((hostname) => {
            urls.forEach((url) => {
              url = url.replace('{hostname}', hostname)
              const origin = computeOrigin(url, false, name, type, '')
              expect(origin.url).to.equal(url)
              expect(origin[type]).to.equal(name)
              if (hostname === 'bitbucket.org') {
                const expectedEditUrlPattern = `https://${hostname}/org-name/repo-name/src/${name}/%s`
                expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
              } else {
                expect(origin).not.to.have.property('editUrlPattern')
              }
            })
          })
        })
      })

      it('should generate correct origin data for file taken from repository on pagure.io', () => {
        const urls = [
          'https://{hostname}/group-name/repo-name.git',
          'https://{hostname}/group-name/repo-name',
          'git@{hostname}:group-name/repo-name.git',
          'git@{hostname}:group-name/repo-name',
        ]
        const hostnames = ['pagure.io', 'private.pagure.io']
        const refs = [['master', 'branch'], ['v1.1.0', 'tag']] // prettier-ignore
        refs.forEach(([name, type]) => {
          hostnames.forEach((hostname) => {
            urls.forEach((url) => {
              url = url.replace('{hostname}', hostname)
              const origin = computeOrigin(url, false, name, type, '')
              expect(origin.url).to.equal(url)
              expect(origin[type]).to.equal(name)
              if (hostname === 'pagure.io') {
                const expectedEditUrlPattern = `https://${hostname}/group-name/repo-name/blob/${name}/f/%s`
                expect(origin.editUrlPattern).to.equal(expectedEditUrlPattern)
              } else {
                expect(origin).not.to.have.property('editUrlPattern')
              }
            })
          })
        })
      })

      it('should generate correct origin data for file taken from worktree', () => {
        const url = 'the-component'
        const worktreePath = ospath.join(CONTENT_REPOS_DIR, url)
        const branch = 'master'
        const expectedfileUriPattern = posixify
          ? 'file:///' + posixify(worktreePath) + '/%s'
          : 'file://' + worktreePath + '/%s'
        const origin = computeOrigin(url, false, branch, 'branch', '', worktreePath)
        expect(origin.url).to.equal(url)
        expect(origin.branch).to.equal(branch)
        expect(origin.fileUriPattern).to.equal(expectedfileUriPattern)
        expect(origin.editUrlPattern).to.be.undefined()
      })

      it('should set correct origin data if URL requires auth', () => {
        const url = 'https://gitlab.com/antora/demo/demo-component-a.git'
        const origin = computeOrigin(url, 'auth-required', 'master', 'branch', '')
        expect(origin.private).to.equal('auth-required')
      })

      it('should not populate editUrl if edit_url key on content source is falsy', async () => {
        const url = 'https://gitlab.com/antora/demo/demo-component-a.git'
        playbookSpec.content.sources.push({ url, editUrl: false })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const file = aggregate[0].files[0]
        expect(file.src).not.to.have.property('editUrl')
      }).timeout(this.timeout() * 2)

      it('should use editUrl pattern to generate editUrl', async () => {
        const webUrl = 'https://gitlab.com/antora/demo/demo-component-a'
        const url = webUrl + '.git'
        playbookSpec.content.sources.push({ url, editUrl: '{web_url}/blob/{refname}/{path}' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        const file = aggregate[0].files.find((it) => it.path.startsWith('modules/ROOT/pages/'))
        expect(file.src.editUrl).to.equal(webUrl + '/blob/master/' + file.src.path)
      }).timeout(this.timeout() * 2)
    })
  })

  describe('distributed component', () => {
    describe('should aggregate files with same component version found in different refs', () => {
      testAll(async (repoBuilder) => {
        const componentDesc = { name: 'the-component', version: 'v1.2.3' }
        await repoBuilder
          .init(componentDesc.name)
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-one.adoc'))
          .then(() => repoBuilder.createTag('v1.2.3'))
          .then(() => repoBuilder.checkoutBranch('v1.2.3-fixes'))
          .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
          .then(() => repoBuilder.removeFromWorktree('modules/ROOT/pages/page-one.adoc'))
          .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-two.adoc'))
          .then(() => repoBuilder.close('master'))
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v1.2.3-fixes', tags: 'v1.2.3' })
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(aggregate[0]).to.include(componentDesc)
        const pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne.src.origin.tag).to.equal('v1.2.3')
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
        const pageTwo = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
        expect(pageOne).to.exist()
        expect(pageTwo).to.exist()
        // FIXME we can't distinguish origin for local bare repo
        if (repoBuilderA.remote) {
          expect(pageOne.src.origin.url).to.equal(repoBuilderA.url)
          expect(pageTwo.src.origin.url).to.equal(repoBuilderB.url)
        } else if (!repoBuilderA.bare) {
          const pageOneFileUri = posixify
            ? `file:///${posixify(repoBuilderA.repoPath)}/${pageOne.src.path}`
            : `file://${repoBuilderA.repoPath}/${pageOne.src.path}`
          const pageTwoFileUri = posixify
            ? `file:///${posixify(repoBuilderB.repoPath)}/${pageTwo.src.path}`
            : `file://${repoBuilderB.repoPath}/${pageTwo.src.path}`
          expect(pageOne.src.fileUri).to.equal(pageOneFileUri)
          expect(pageTwo.src.fileUri).to.equal(pageTwoFileUri)
        }
      }, 2)
    })

    describe('should reuse repository if url occurs multiple times in content sources', () => {
      testAll(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder, { name: 'the-component', version: 'master' }, [], () =>
          repoBuilder
            .checkoutBranch('v1.0')
            .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: '1.0' }))
            .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-one.adoc'))
            .then(() => repoBuilder.checkoutBranch('v2.0'))
            .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: '2.0' }))
            .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-two.adoc'))
            .then(() => repoBuilder.checkoutBranch('master'))
        )
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v1.0' })
        playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v2.0' })
        const aggregate = await aggregateContent(playbookSpec)
        if (repoBuilder.remote) {
          expect(CONTENT_CACHE_DIR)
            .to.be.a.directory()
            .and.subDirs.have.lengthOf(1)
        }
        expect(aggregate).to.have.lengthOf(2)
        expect(aggregate[0]).to.include({ name: 'the-component', version: '1.0' })
        let pageOne = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne).to.exist()
        let pageTwo = aggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
        expect(pageTwo).to.not.exist()
        expect(aggregate[1]).to.include({ name: 'the-component', version: '2.0' })
        pageOne = aggregate[1].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
        expect(pageOne).to.exist()
        pageTwo = aggregate[1].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
        expect(pageTwo).to.exist()
      })
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

      it('should set src.fileUri property on files taken from worktree', async () => {
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
        expect(files[0].src).to.have.property('fileUri')
        const fileUris = files.map((file) => file.src.fileUri)
        expect(fileUris).to.have.members(expectedUrls)
      })

      it('should populate file with correct contents from worktree of clone', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
        await initRepoWithFilesAndWorktree(repoBuilder)
        const clonePath = ospath.join(CONTENT_REPOS_DIR, 'clone')
        await repoBuilder.clone(clonePath)
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
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
        await initRepoWithFilesAndWorktree(repoBuilder)
        await testNonWorktreeAggregate(repoBuilder)
      })

      // NOTE this test verifies we can clone a remote repository by pointing to the .git sub-directory
      it('on remote bare repo', async () => {
        const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
        await initRepoWithFilesAndWorktree(repoBuilder)
        repoBuilder.url += '/.git'
        expect(repoBuilder.url).to.match(/\.git\/\.git$/)
        await testNonWorktreeAggregate(repoBuilder)
      })
    })
  })

  it('should create bare repository with detached HEAD under cache directory', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    const defaultBranch = 'tip'
    await initRepoWithFiles(repoBuilder, undefined, undefined, () => repoBuilder.checkoutBranch(defaultBranch))
    playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'HEAD' })
    let aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.have.nested.property('files[0].src.origin.branch', defaultBranch)
    expect(CONTENT_CACHE_DIR)
      .to.be.a.directory()
      .with.subDirs.have.lengthOf(1)
    const cachedRepoName = await fs.readdir(CONTENT_CACHE_DIR).then((entries) => entries[0])
    expect(cachedRepoName).to.match(/\.git$/)
    const clonedRepoBuilder = new RepositoryBuilder(CONTENT_CACHE_DIR, FIXTURES_DIR, { bare: true })
    await clonedRepoBuilder.open(cachedRepoName)
    const clonePath = clonedRepoBuilder.repoPath
    expect(clonePath).to.have.extname('.git')
    expect(ospath.join(clonePath, 'refs/remotes/origin/HEAD'))
      .to.be.a.file()
      .and.have.contents.that.match(new RegExp(`^ref: refs/remotes/origin/${defaultBranch}(?=$|\n)`))
    expect(ospath.join(clonePath, 'refs/heads')).to.be.a.directory()
    //.and.empty()
    // NOTE make sure local HEAD is ignored
    await clonedRepoBuilder.checkoutBranch$1('local', 'refs/remotes/origin/HEAD')
    aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.have.nested.property('files[0].src.origin.branch', defaultBranch)
    // NOTE make sure local HEAD is considered if remote HEAD is missing
    await fs.rename(ospath.join(clonePath, 'refs/remotes/origin/HEAD'), ospath.join(clonePath, 'HEAD'))
    aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.have.nested.property('files[0].src.origin.branch', defaultBranch)
  })

  it('should fetch updates into non-empty cached repository when runtime.fetch option is enabled', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    await initRepoWithFiles(repoBuilder, undefined, 'modules/ROOT/pages/page-one.adoc', () =>
      repoBuilder.createTag('ignored').then(() => repoBuilder.checkoutBranch('v1.2.x'))
    )
    playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*', tags: 'release/*' })

    const firstAggregate = await aggregateContent(playbookSpec)

    expect(firstAggregate).to.have.lengthOf(1)
    expect(firstAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    let page1v1 = firstAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v1).to.exist()

    await repoBuilder
      .open()
      .then(() => repoBuilder.checkoutBranch('v2.0.x'))
      .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v2.0.0' }))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-two.adoc'))
      .then(() => repoBuilder.checkoutBranch('2.0.x-releases'))
      .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v2.0.1' }))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/topic-b/page-four.adoc'))
      .then(() => repoBuilder.createTag('release/2.0.1'))
      .then(() => repoBuilder.checkoutBranch('v1.2.x'))
      .then(() => repoBuilder.addToWorktree('modules/ROOT/pages/page-one.adoc', '= Page One\n\nUpdate received!'))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/topic-a/page-three.adoc'))
      .then(() => repoBuilder.close())

    playbookSpec.runtime.fetch = true
    const secondAggregate = await aggregateContent(playbookSpec)

    expect(secondAggregate).to.have.lengthOf(3)
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
    expect(secondAggregate[2]).to.include({ name: 'the-component', version: 'v2.0.1' })
    const page4v2 = secondAggregate[2].files.find((file) => file.path === 'modules/ROOT/pages/topic-b/page-four.adoc')
    expect(page4v2).to.exist()
  })

  it('should fetch updates into empty cached repository when runtime.fetch option is enabled', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    await repoBuilder.init('the-component').then(() => repoBuilder.close())
    playbookSpec.content.sources.push({ url: repoBuilder.url })
    const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
    expect(aggregateContentDeferred).to.throw()

    await repoBuilder
      .open()
      .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v1.0' }))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-one.adoc'))
      .then(() => repoBuilder.close())

    playbookSpec.runtime.fetch = true
    const aggregate = await aggregateContent(playbookSpec)

    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.0' })
    expect(aggregate[0].files).to.have.lengthOf(1)
    expect(aggregate[0].files[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
  })

  it('should fetch tags not reachable from fetched commits when runtime.fetch option is enabled', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    await initRepoWithFiles(repoBuilder, undefined, 'modules/ROOT/pages/page-one.adoc', () =>
      repoBuilder.checkoutBranch('v1.2.x')
    )
    playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })

    const firstAggregate = await aggregateContent(playbookSpec)

    expect(firstAggregate).to.have.lengthOf(1)
    expect(firstAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    let page1v1 = firstAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v1).to.exist()

    await repoBuilder
      .open()
      .then(() => repoBuilder.checkoutBranch('v1.2.x'))
      .then(() => repoBuilder.createTag('v1.2.3'))
      .then(() => repoBuilder.checkoutBranch('v2.0.x'))
      .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v2.0.1' }))
      .then(() => repoBuilder.addFilesFromFixture('modules/ROOT/pages/page-two.adoc'))
      .then(() => repoBuilder.createTag('v2.0.1'))
      .then(() => repoBuilder.deleteBranch('v2.0.x'))
      .then(() => repoBuilder.close())

    playbookSpec.runtime.fetch = true
    playbookSpec.content.sources[0].branches = 'v2*'
    // NOTE this also verifies we can fetch tags after not fetching them originally
    playbookSpec.content.sources[0].tags = 'v*'
    const secondAggregate = await aggregateContent(playbookSpec)

    expect(secondAggregate).to.have.lengthOf(2)
    expect(secondAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    page1v1 = secondAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v1).to.exist()
    expect(secondAggregate[1]).to.include({ name: 'the-component', version: 'v2.0.1' })
    const page2v2 = secondAggregate[1].files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
    expect(page2v2).to.exist()
  })

  it('should prune branches when runtime.fetch option is enabled', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    const componentDesc = { name: 'the-component', version: '1.2' }
    await initRepoWithFiles(repoBuilder, componentDesc, 'modules/ROOT/pages/page-one.adoc', () =>
      repoBuilder
        .checkoutBranch('v1.2.x')
        .then(() => repoBuilder.commitAll('create stable version'))
        .then(() => repoBuilder.checkoutBranch('v1.1.x'))
        .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: '1.1' }))
        .then(() => repoBuilder.addToWorktree('modules/ROOT/pages/page-one.adoc', '= Page One\n\nPrevious content.'))
        .then(() => repoBuilder.commitAll('restore previous version'))
        .then(() => repoBuilder.checkoutBranch('v2.0.x'))
        .then(() => repoBuilder.addComponentDescriptor({ name: 'the-component', version: '2.0' }))
        .then(() => repoBuilder.addToWorktree('modules/ROOT/pages/page-two.adoc', '= Page Two\n\nNew content.'))
        .then(() => repoBuilder.commitAll('add new version'))
        .then(() => repoBuilder.checkoutBranch('v1.2.x'))
    )
    playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*' })

    const firstAggregate = await aggregateContent(playbookSpec)
    expect(firstAggregate).to.have.lengthOf(3)
    expect(firstAggregate.map((it) => it.version)).to.have.members(['1.1', '1.2', '2.0'])
    let page = firstAggregate
      .find((it) => it.version === '1.1')
      .files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page.contents.toString()).to.have.string('Previous content')
    page = firstAggregate
      .find((it) => it.version === '2.0')
      .files.find((file) => file.path === 'modules/ROOT/pages/page-two.adoc')
    expect(page.contents.toString()).to.have.string('New content')

    await repoBuilder
      .open()
      .then(() => repoBuilder.checkoutBranch('v2.0.x'))
      .then(() => repoBuilder.deleteBranch('v1.1.x'))
      .then(() => repoBuilder.deleteBranch('v1.2.x'))
      .then(() => repoBuilder.close())
    playbookSpec.runtime.fetch = true

    const secondAggregate = await aggregateContent(playbookSpec)
    expect(secondAggregate).to.have.lengthOf(1)
    expect(secondAggregate[0]).to.include({ name: 'the-component', version: '2.0' })
  })

  it('should prune tags when runtime.fetch option is enabled and source has tags filter', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    await initRepoWithFiles(repoBuilder, undefined, 'modules/ROOT/pages/page-one.adoc', () =>
      repoBuilder
        .checkoutBranch('v1.2.x')
        .then(() => repoBuilder.checkoutBranch('v1.1.x'))
        .then(() => repoBuilder.addComponentDescriptorToWorktree({ name: 'the-component', version: 'v1.1' }))
        .then(() => repoBuilder.addToWorktree('modules/ROOT/pages/page-one.adoc', '= Page One\n\nPrevious content.'))
        .then(() => repoBuilder.commitAll('restore previous content'))
        .then(() => repoBuilder.checkoutBranch('releases'))
        .then(() => repoBuilder.addComponentDescriptor({ name: 'the-component', version: 'v1.1.0' }))
        .then(() => repoBuilder.createTag('v1.1.0'))
        .then(() => repoBuilder.checkoutBranch('v1.2.x'))
    )
    playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v*', tags: 'v*' })

    const firstAggregate = await aggregateContent(playbookSpec)
    expect(firstAggregate).to.have.lengthOf(3)
    expect(firstAggregate.map((it) => it.version)).to.have.members(['v1.1.0', 'v1.1', 'v1.2.3'])
    const page = firstAggregate
      .find((it) => it.version === 'v1.1')
      .files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page.contents.toString()).to.have.string('Previous content')

    await repoBuilder
      .open()
      .then(() => repoBuilder.deleteBranch('v1.1.x'))
      .then(() => repoBuilder.deleteTag('v1.1.0'))
      .then(() => repoBuilder.close())
    playbookSpec.runtime.fetch = true

    const secondAggregate = await aggregateContent(playbookSpec)
    expect(secondAggregate).to.have.lengthOf(1)
    expect(secondAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
  })

  it('should not fetch updates into cached repository when runtime.fetch option is not enabled', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
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
      .then(() => repoBuilder.checkoutBranch('v1.2.3'))
      .then(() => repoBuilder.addToWorktree('modules/ROOT/pages/page-one.adoc', '= Page One\n\nUpdate received!'))
      .then(() => repoBuilder.commitAll('content updates'))
      .then(() => repoBuilder.close())

    const secondAggregate = await aggregateContent(playbookSpec)

    expect(secondAggregate).to.have.lengthOf(1)
    expect(secondAggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    page1v1 = secondAggregate[0].files.find((file) => file.path === 'modules/ROOT/pages/page-one.adoc')
    expect(page1v1).to.exist()
    expect(page1v1.contents.toString()).to.not.have.string('Update received!')
  })

  if (process.env.CI_COMMIT_REF_NAME === 'releases') {
    it('should clone a remote repository with a large number of branches', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder, {}, [], async () => {
        // 750 branches triggers the high water mark inside of isomorphic-git
        for (let i = 0; i < 750; i++) {
          const version = 'v' + i
          const componentDesc = { name: 'the-component', title: 'The Component', version }
          await repoBuilder
            .checkoutBranch(version)
            .then(() => repoBuilder.addComponentDescriptorToWorktree(componentDesc))
            .then(() => repoBuilder.commitSelect(['antora.yml'], 'add version'))
        }
        await repoBuilder.checkoutBranch('master')
      })
      playbookSpec.content.sources.push({ url: repoBuilder.url, branches: 'v1' })
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(1)
    }).timeout(this.timeout() * 3)
  }

  it('should prefer remote branches in bare repository', async () => {
    const remoteRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    await initRepoWithFiles(remoteRepoBuilder, { repoName: 'the-component-remote' })

    const localRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { bare: true })
    await initRepoWithFiles(localRepoBuilder, { repoName: 'the-component-local' }, undefined, () =>
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

  // NOTE this test doesn't always trigger the condition being tested; it depends on the order the refs are returned
  // FIXME use a spy to make the order determinant
  it('should discover components in specified remote', async () => {
    const remoteRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    const remoteComponentDesc = {
      repoName: 'the-component-remote',
      name: 'the-component',
      version: 'v2.0',
    }
    // NOTE master branch in remote will get shadowed
    await initRepoWithFiles(remoteRepoBuilder, remoteComponentDesc, undefined, () =>
      remoteRepoBuilder.checkoutBranch('v2.0')
    )

    const localRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
    await initRepoWithFiles(localRepoBuilder, { repoName: 'the-component-local' }, undefined, () =>
      localRepoBuilder.addRemote('upstream', remoteRepoBuilder.url)
    )

    playbookSpec.content.sources.push({ url: localRepoBuilder.url, remote: 'upstream' })

    const aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(2)
    expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
    expect(aggregate[1]).to.include({ name: 'the-component', version: 'v2.0' })
  })

  it('should not discover branches in other remotes', async () => {
    const remoteRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    const remoteComponentDesc = {
      repoName: 'the-component-remote',
      name: 'the-component',
      version: 'v2.0',
    }
    await initRepoWithFiles(remoteRepoBuilder, remoteComponentDesc, undefined, () =>
      remoteRepoBuilder.checkoutBranch('v2.0')
    )

    const localRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
    await initRepoWithFiles(localRepoBuilder, { repoName: 'the-component-local' }, undefined, () =>
      localRepoBuilder.addRemote('upstream', remoteRepoBuilder.url)
    )

    playbookSpec.content.sources.push({ url: localRepoBuilder.url })

    const aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
  })

  // technically, we don't know what it did w/ the remote we specified, but it should work regardless
  it('should ignore remote on cached repository', async () => {
    const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
    await initRepoWithFiles(repoBuilder)

    playbookSpec.content.sources.push({ url: repoBuilder.url, remote: 'upstream' })

    const aggregate = await aggregateContent(playbookSpec)
    expect(aggregate).to.have.lengthOf(1)
    expect(aggregate[0]).to.include({ name: 'the-component', version: 'v1.2.3' })
  })

  describe('should support IPv6 hostname', () => {
    testRemote(async (repoBuilder) => {
      await initRepoWithFiles(repoBuilder)
      playbookSpec.content.sources.push({ url: repoBuilder.url.replace('//localhost:', '//[::1]:') })
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(1)
    })
  })

  describe('progress bars', () => {
    let repoBuilder

    beforeEach(async () => {
      playbookSpec.runtime.quiet = false
      repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder, {
        repoName: 'long-enough-name-to-trigger-a-progress-bar-when-used-as-width',
      })
      playbookSpec.content.sources.push({ url: repoBuilder.url })
    })

    it('should show progress bar when cloning a remote repository', async () => {
      return withMockStdout(async (lines) => {
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf.at.least(2)
        expect(lines[0]).to.include('[clone] ' + repoBuilder.url)
        expect(lines[0]).to.match(/ \[-+\]/)
        expect(lines[lines.length - 1]).to.match(/ \[#+\]/)
      }, GIT_OPERATION_LABEL_LENGTH + 1 + repoBuilder.url.length * 2)
    })

    it('should show progress bar when fetching a remote repository', async () => {
      return withMockStdout(async (lines) => {
        await aggregateContent(playbookSpec)
        lines.length = 0
        playbookSpec.runtime.fetch = true
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf.at.least(2)
        expect(lines[0]).to.include('[fetch] ' + repoBuilder.url)
        expect(lines[0]).to.match(/ \[-+\]/)
        expect(lines[lines.length - 1]).to.match(/ \[#+\]/)
      }, GIT_OPERATION_LABEL_LENGTH + 1 + repoBuilder.url.length * 2)
    })

    it('should cancel progress bar for fetch and create new one for clone if fetch fails', async () => {
      playbookSpec.runtime.quiet = true
      await aggregateContent(playbookSpec)
      const cachedRepoName = await fs.readdir(CONTENT_CACHE_DIR).then((entries) => entries[0])
      // NOTE corrupt the cloned repository
      await fs.writeFile(ospath.join(CONTENT_CACHE_DIR, cachedRepoName, 'config'), '')
      playbookSpec.runtime.quiet = false
      playbookSpec.runtime.fetch = true
      return withMockStdout(async (lines) => {
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf.at.least(2)
        expect(lines[0]).to.include('[fetch] ' + repoBuilder.url)
        expect(lines[0]).to.match(/ \[-+\]$/)
        expect(lines[1]).to.include('[fetch] ' + repoBuilder.url)
        expect(lines[1]).to.match(/ \[\?+\]$/)
        expect(lines[lines.length - 1]).to.include('[clone] ' + repoBuilder.url)
        expect(lines[lines.length - 1]).to.match(/ \[#+\]$/)
      }, GIT_OPERATION_LABEL_LENGTH + 1 + repoBuilder.url.length * 2)
    })

    it('should show clone progress bar for each remote repository', async () => {
      const otherRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(otherRepoBuilder, {
        name: 'the-other-component',
        title: 'The Other Component',
        version: 'v1.0.0',
      })
      playbookSpec.content.sources.push({ url: otherRepoBuilder.url })

      return withMockStdout(async (lines) => {
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(lines).to.have.lengthOf.at.least(4)
        const repoLines = lines.filter((l) => l.includes(repoBuilder.url))
        expect(repoLines).to.have.lengthOf.at.least(2)
        expect(repoLines[0]).to.include('[clone] ' + repoBuilder.url)
        expect(repoLines[0]).to.match(/ \[-+\]/)
        expect(repoLines[repoLines.length - 1]).to.match(/ \[#+\]/)
        const otherRepoLines = lines.filter((l) => l.includes(otherRepoBuilder.url))
        expect(otherRepoLines).to.have.lengthOf.at.least(2)
        expect(otherRepoLines[0]).to.include('[clone] ' + otherRepoBuilder.url)
        expect(otherRepoLines[0]).to.match(/ \[-+\]/)
        expect(otherRepoLines[otherRepoLines.length - 1]).to.match(/ \[#+\]/)
      }, GIT_OPERATION_LABEL_LENGTH + 1 + Math.max(repoBuilder.url.length, otherRepoBuilder.url.length) * 2)
    })

    it('should show progress bars with mixed operations', async () => {
      const otherRepoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(otherRepoBuilder, {
        name: 'the-other-component',
        title: 'The Other Component',
        version: 'v1.0.0',
      })

      return withMockStdout(async (lines) => {
        await aggregateContent(playbookSpec)
        lines.length = 0
        playbookSpec.content.sources.push({ url: otherRepoBuilder.url })
        playbookSpec.runtime.fetch = true
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(2)
        expect(lines).to.have.lengthOf.at.least(4)
        const repoLines = lines.filter((l) => l.includes(repoBuilder.url))
        expect(repoLines[0]).to.include('[fetch] ' + repoBuilder.url)
        expect(repoLines[0]).to.match(/ \[-+\]/)
        expect(repoLines[repoLines.length - 1]).to.match(/ \[#+\]/)
        const otherRepoLines = lines.filter((l) => l.includes(otherRepoBuilder.url))
        expect(otherRepoLines[0]).to.include('[clone] ' + otherRepoBuilder.url)
        expect(otherRepoLines[0]).to.match(/ \[-+\]/)
        expect(otherRepoLines[otherRepoLines.length - 1]).to.match(/ \[#+\]/)
      }, GIT_OPERATION_LABEL_LENGTH + 1 + repoBuilder.url.length * 2)
    })

    it('should truncate repository URL to fit within progress bar', async () => {
      return withMockStdout(async (lines) => {
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf.at.least(2)
        expect(lines[0]).to.include('[clone] ...' + repoBuilder.url.substr(7))
      }, repoBuilder.url.length * 2)
    })

    it('should not show progress bar if window is too narrow', async () => {
      return withMockStdout(async (lines) => {
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf(0)
      }, 40)
    })

    it('should not show progress bar if stdout is not a TTY', async () => {
      return withMockStdout(
        async (lines) => {
          const aggregate = await aggregateContent(playbookSpec)
          expect(aggregate).to.have.lengthOf(1)
          expect(lines).to.have.lengthOf(0)
        },
        120,
        false
      )
    })

    it('should not show progress bar if playbook runtime is quiet', async () => {
      return withMockStdout(async (lines) => {
        playbookSpec.runtime = { quiet: true }
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf(0)
      })
    })

    it('should not show progress bar if playbook runtime is silent', async () => {
      return withMockStdout(async (lines) => {
        playbookSpec.runtime = { silent: true }
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf(0)
      })
    })

    it('should not show progress bar if repository is local', async () => {
      return withMockStdout(async (lines) => {
        playbookSpec.content.sources[0].url = repoBuilder.repoPath
        const aggregate = await aggregateContent(playbookSpec)
        expect(aggregate).to.have.lengthOf(1)
        expect(lines).to.have.lengthOf(0)
      })
    })

    it('should advance cursor past progress bars when error is thrown', async () => {
      return withMockStdout(async () => {
        playbookSpec.content.sources.pop()
        playbookSpec.content.sources.push({ url: 'https://gitlab.com/antora/no-such-repository-a.git' })
        playbookSpec.content.sources.push({ url: 'https://gitlab.com/antora/no-such-repository-b.git' })
        await deferExceptions(aggregateContent, playbookSpec)
        expect(process.stdout.clearLine).to.have.been.called.exactly(3)
      })
    })
  })

  describe('fs plugin', () => {
    afterEach(() => {
      RepositoryBuilder.unregisterPlugin('fs', GIT_CORE)
    })

    it('should use fs object specified on git core', async () => {
      const customFs = Object.assign({}, fs)
      customFs.readFile = spy(customFs.readFile)
      RepositoryBuilder.registerPlugin('fs', customFs, GIT_CORE)
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      await initRepoWithFiles(repoBuilder)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(1)
      expect(customFs.readFile).to.have.been.called()
      expect(RepositoryBuilder.getPlugin('fs', GIT_CORE)).to.equal(customFs)
    })
  })

  describe('authentication', () => {
    let authorizationHeaderValue
    let credentialsRequestCount
    let credentialsSent
    let credentialsVerdict
    let skipAuthenticateIfNoAuth
    let originalEnv

    before(() => {
      originalEnv = process.env
    })

    beforeEach(() => {
      process.env.USERPROFILE = process.env.HOME = WORK_DIR
      process.env.XDG_CONFIG_HOME = ospath.join(WORK_DIR, '.local')
      authorizationHeaderValue = undefined
      credentialsRequestCount = 0
      credentialsSent = undefined
      credentialsVerdict = undefined
      skipAuthenticateIfNoAuth = undefined
      gitServer.authenticate = ({ type, repo, user, headers }, next) => {
        authorizationHeaderValue = headers.authorization
        if (type === 'fetch') {
          if (!authorizationHeaderValue && skipAuthenticateIfNoAuth) {
            credentialsSent = {}
            next()
          } else {
            user((username, password) => {
              credentialsRequestCount++
              credentialsSent = { username, password }
              credentialsVerdict ? next(credentialsVerdict) : next()
            })
          }
        } else {
          next()
        }
      }
    })

    afterEach(() => {
      RepositoryBuilder.unregisterPlugin('credentialManager', GIT_CORE)
    })

    after(() => {
      gitServer.authenticate = undefined
      process.env = originalEnv
    })

    it('should read valid credentials from URL', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url
      // NOTE include '=' in value to validate characters are not URL encoded
      repoBuilder.url = urlWithoutAuth.replace('//', '//u=:p=@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u=:p=').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u=', password: 'p=' })
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files).to.not.be.empty()
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-embedded')
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.url', urlWithoutAuth)
    })

    it('should remove empty credentials from URL', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url
      repoBuilder.url = urlWithoutAuth.replace('//', '//@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      skipAuthenticateIfNoAuth = true
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.be.undefined()
      expect(credentialsSent).to.eql({})
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files).to.not.be.empty()
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-embedded')
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.url', urlWithoutAuth)
    })

    it('should remove credentials with empty username and password from URL', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url
      repoBuilder.url = urlWithoutAuth.replace('//', '//:@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      skipAuthenticateIfNoAuth = true
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.be.undefined()
      expect(credentialsSent).to.eql({})
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files).to.not.be.empty()
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-embedded')
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.url', urlWithoutAuth)
    })

    it('should ignore credentials in URL with only password', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url
      repoBuilder.url = urlWithoutAuth.replace('//', '//:p@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      skipAuthenticateIfNoAuth = true
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.be.undefined()
      expect(credentialsSent).to.eql({})
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files).to.not.be.empty()
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-embedded')
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.url', urlWithoutAuth)
    })

    it('should throw exception if credentials in URL are not accepted', async () => {
      credentialsVerdict = 'no entry!'
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url
      repoBuilder.url = urlWithoutAuth.replace('//', '//u:p@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      const expectedErrorMessage = 'Content repository not found or requires credentials (url: ' + urlWithoutAuth + ')'
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
    })

    it('should clone with valid credentials after failed attempt to clone with invalid credentials', async () => {
      credentialsVerdict = 'no entry!'
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url
      repoBuilder.url = urlWithoutAuth.replace('//', '//u:p@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      const expectedErrorMessage = 'Content repository not found or requires credentials (url: ' + urlWithoutAuth + ')'
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(CONTENT_CACHE_DIR)
        .to.be.a.directory()
        .and.be.empty()
      authorizationHeaderValue = undefined
      credentialsVerdict = undefined
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files).to.not.be.empty()
    })

    // NOTE this test would fail if the git client didn't automatically add the .git extension
    it('should add .git extension to URL if missing', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const urlWithoutAuth = repoBuilder.url.replace('.git', '')
      playbookSpec.content.sources.push({ url: urlWithoutAuth.replace('//', '//u:p@') })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files).to.not.be.empty()
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.url', urlWithoutAuth)
    })

    it('should pass empty password if only username is specified in URL', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      repoBuilder.url = repoBuilder.url.replace('//', '//u@')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:').toString('base64'))
      expect(credentialsSent).not.to.be.undefined()
      expect(credentialsSent.username).to.equal('u')
      expect(credentialsSent.password).to.equal('')
      expect(aggregate).to.have.lengthOf(1)
    })

    it('should read credentials for URL path from git credential store if auth is required', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      // NOTE include '=' in value to validate characters are not URL encoded
      const credentials = ['invalid URL', repoBuilder.url.replace('//', '//u=:p=@')]
      await fs.writeFile(ospath.join(WORK_DIR, '.git-credentials'), credentials.join('\n') + '\n')
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u=:p=').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u=', password: 'p=' })
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-required')
    })

    it('should mark origin that requires auth with private=auth-required if not fetching updates', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = repoBuilder.url.replace('//', '//u:p@') + '\n'
      await fs.writeFile(ospath.join(WORK_DIR, '.git-credentials'), credentials)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      let aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-required')
      credentialsSent = undefined
      aggregate = await aggregateContent(playbookSpec)
      expect(credentialsSent).to.be.undefined()
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files[0]).to.have.nested.property('src.origin.private', 'auth-required')
    })

    it('should mark origin as private when fetch gets valid credentials from credential store', async () => {
      const repoBuilderA = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      const repoBuilderB = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilderA, { name: 'component-a', version: '1.0' })
      await initRepoWithFiles(repoBuilderB, { name: 'component-b', version: '3.0' })
      const credentials = [repoBuilderA.url.replace('//', '//u:p@'), repoBuilderB.url.replace('//', '//u:p@')]
      await fs.writeFile(ospath.join(WORK_DIR, '.git-credentials'), credentials.join('\n') + '\n')
      playbookSpec.content.sources.push({ url: repoBuilderA.url }, { url: repoBuilderB.url })
      let aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(credentialsRequestCount).to.equal(2)
      expect(aggregate).to.have.lengthOf(2)
      playbookSpec.runtime.fetch = true
      credentialsSent = undefined
      credentialsRequestCount = 0
      aggregate = await aggregateContent(playbookSpec)
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(credentialsRequestCount).to.equal(2)
      expect(aggregate).to.have.lengthOf(2)
      const aggregateA = aggregate.find((it) => it.name === 'component-a')
      const aggregateB = aggregate.find((it) => it.name === 'component-b')
      expect(aggregateA.files).to.not.be.empty()
      expect(aggregateA.files[0]).to.have.nested.property('src.origin.private', 'auth-required')
      expect(aggregateB.files).to.not.be.empty()
      expect(aggregateB.files[0]).to.have.nested.property('src.origin.private', 'auth-required')
    })

    it('should match entry in git credential store if specified without .git extension', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = repoBuilder.url.replace('//', '//u:p@').replace('.git', '') + '\n'
      await fs.writeFile(ospath.join(WORK_DIR, '.git-credentials'), credentials)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
    })

    it('should read credentials for URL host from git credential store if auth is required', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = repoBuilder.url.substr(0, repoBuilder.url.indexOf('/', 8)).replace('//', '//u:p@') + '\n'
      await fs.writeFile(ospath.join(WORK_DIR, '.git-credentials'), credentials)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
    })

    it('should read credentials for URL from git credential store (XDG) if auth is required', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = repoBuilder.url.replace('//', '//u:p@') + '\n'
      await fs.mkdirp(ospath.join(process.env.XDG_CONFIG_HOME, 'git'))
      await fs.writeFile(ospath.join(process.env.XDG_CONFIG_HOME, 'git', 'credentials'), credentials)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
    })

    it('should read credentials from specified path if auth is required', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = ['https://token@gitlab.com', 'https://git-host', repoBuilder.url.replace('//', '//u:p@')]
      const customGitCredentialsPath = ospath.join(WORK_DIR, '.custom-git-credentials')
      await fs.writeFile(customGitCredentialsPath, credentials.join('\n') + '\n')
      playbookSpec.git = { credentials: { path: customGitCredentialsPath } }
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
    })

    it('should read credentials from specified contents if auth is required', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = 'https://token@git-host,' + repoBuilder.url.replace('//', '//u:p@') + '\n'
      playbookSpec.git = { credentials: { contents: credentials } }
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
    })

    it('should not pass credentials if credential store is missing', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      const expectedErrorMessage = 'Content repository not found or requires credentials (url: ' + repoBuilder.url + ')'
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
      expect(authorizationHeaderValue).to.be.undefined()
      expect(credentialsSent).to.be.undefined()
    })

    it('should not attempt to clone if credentials were rejected during fetch', async () => {
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      const credentials = repoBuilder.url.substr(0, repoBuilder.url.indexOf('/', 8)).replace('//', '//u:p@') + '\n'
      await fs.writeFile(ospath.join(WORK_DIR, '.git-credentials'), credentials)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(aggregate).to.have.lengthOf(1)
      expect(CONTENT_CACHE_DIR)
        .to.be.a.directory()
        .and.not.be.empty()
      credentialsRequestCount = 0
      credentialsSent = undefined
      credentialsVerdict = 'denied!'
      playbookSpec.runtime.quiet = false
      playbookSpec.runtime.fetch = true
      return withMockStdout(async (lines) => {
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        const expectedErrorMessage =
          'Content repository not found or credentials were rejected (url: ' + repoBuilder.url + ')'
        expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
        expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
        expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
        expect(credentialsRequestCount).to.equal(1)
        expect(lines.filter((l) => l.startsWith('[clone]'))).to.have.lengthOf(0)
        expect(CONTENT_CACHE_DIR)
          .to.be.a.directory()
          .and.be.empty()
      })
    })

    it('should use registered credential manager and enhance it with status method', async () => {
      const credentialManager = {
        async fill ({ url }) {
          this.fulfilledUrl = url
          return { username: 'u', password: 'p' }
        },
        async approved ({ url }) {},
        async rejected ({ url, auth }) {},
      }
      RepositoryBuilder.registerPlugin('credentialManager', credentialManager, GIT_CORE)
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
      expect(RepositoryBuilder.getPlugin('credentialManager', GIT_CORE)).not.to.equal(credentialManager)
      expect(RepositoryBuilder.getPlugin('credentialManager', GIT_CORE).fulfilledUrl).to.equal(repoBuilder.url)
    })

    it('should not enhance registered credential manager if it already contains a status method', async () => {
      const credentialManager = {
        async fill ({ url }) {
          this.fulfilledUrl = url
          return { username: 'u', password: 'p' }
        },
        async approved ({ url }) {},
        async rejected ({ url, auth }) {},
        status ({ url }) {
          return true
        },
      }
      RepositoryBuilder.registerPlugin('credentialManager', credentialManager, GIT_CORE)
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      const aggregate = await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialsSent).to.eql({ username: 'u', password: 'p' })
      expect(aggregate).to.have.lengthOf(1)
      expect(aggregate[0].files[0].src.origin.private).to.equal('auth-required')
      expect(RepositoryBuilder.getPlugin('credentialManager', GIT_CORE)).to.equal(credentialManager)
      expect(credentialManager.fulfilledUrl).to.equal(repoBuilder.url)
    })

    it('should invoke configure method on custom credential manager if defined', async () => {
      const credentialManager = {
        configure () {
          this.configured = true
        },
        async fill ({ url }) {
          return { username: 'u', password: 'p' }
        },
        async approved ({ url }) {},
        async rejected ({ url, auth }) {},
      }
      RepositoryBuilder.registerPlugin('credentialManager', credentialManager, GIT_CORE)
      const repoBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: { gitServerPort } })
      await initRepoWithFiles(repoBuilder)
      playbookSpec.content.sources.push({ url: repoBuilder.url })
      await aggregateContent(playbookSpec)
      expect(authorizationHeaderValue).to.equal('Basic ' + Buffer.from('u:p').toString('base64'))
      expect(credentialManager.configured).to.be.true()
    })
  })

  describe('invalid local repository', () => {
    it('should throw meaningful error if local relative content directory does not exist', async () => {
      const invalidDir = './no-such-directory'
      const absInvalidDir = ospath.join(WORK_DIR, invalidDir)
      playbookSpec.dir = WORK_DIR
      playbookSpec.content.sources.push({ url: invalidDir })
      const expectedErrorMessage =
        'Local content source does not exist: ' + absInvalidDir + ' (url: ' + invalidDir + ')'
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
    })

    it('should throw meaningful error if local absolute content directory does not exist', async () => {
      const absInvalidDir = ospath.join(WORK_DIR, 'no-such-directory')
      playbookSpec.content.sources.push({ url: absInvalidDir })
      const expectedErrorMessage = 'Local content source does not exist: ' + absInvalidDir
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
    })

    it('should throw meaningful error if local relative content directory is not a git repository', async () => {
      const regularDir = './regular-directory'
      const absRegularDir = ospath.join(WORK_DIR, regularDir)
      fs.ensureDirSync(absRegularDir)
      fs.writeFileSync(ospath.join(absRegularDir, 'antora.xml'), 'name: the-component\nversion: 1.0')
      playbookSpec.dir = WORK_DIR
      playbookSpec.content.sources.push({ url: regularDir })
      const expectedErrorMessage =
        'Local content source must be a git repository: ' + absRegularDir + ' (url: ' + regularDir + ')'
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
    })

    it('should throw meaningful error if local absolute content directory is not a git repository', async () => {
      const absRegularDir = ospath.join(WORK_DIR, 'regular-directory')
      fs.ensureDirSync(absRegularDir)
      fs.writeFileSync(ospath.join(absRegularDir, 'antora.xml'), 'name: the-component\nversion: 1.0')
      playbookSpec.content.sources.push({ url: absRegularDir })
      const expectedErrorMessage = 'Local content source must be a git repository: ' + absRegularDir
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
    })

    // NOTE on Windows, : is a reserved filename character, so we can't use this test there
    if (process.platform !== 'win32') {
      it('should treat SSH URI as a remote repository', async () => {
        const repoBuilder = new RepositoryBuilder(WORK_DIR, FIXTURES_DIR)
        const repoName = 'no-such-user@localhost:no-such-repository'
        await initRepoWithFiles(repoBuilder, { repoName })
        playbookSpec.content.sources.push({ url: repoName })
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw()
      })
    }
  })

  describe('invalid remote repository', () => {
    let server
    let serverPort
    before(async () => {
      serverPort = await new Promise(
        (resolve, reject) =>
          (server = http
            .createServer((req, res) => {
              const headers = {}
              let body = 'No dice!'
              let stream
              let [statusCode, scenario] = req.url.split('/').slice(1, 3)
              statusCode = parseInt(statusCode)
              scenario = scenario.replace(/\.git$/, '')
              if (statusCode === 401) {
                headers['WWW-Authenticate'] = 'Basic realm="example"'
              } else if (statusCode === 301) {
                headers.Location = 'http://example.org'
              } else if (statusCode === 200) {
                if (scenario === 'incomplete-ref-capabilities') {
                  body = '001e# service=git-upload-pack\n0007ref\n'
                } else if (scenario === 'insufficient-capabilities') {
                  body = '001e# service=git-upload-pack\n0009ref\x00\n'
                } else {
                  body = '0000'
                }
                headers['Transfer-Encoding'] = 'chunked'
                stream = new Readable({
                  read (size) {
                    this.push(body)
                    this.push(null)
                  },
                })
              }
              res.writeHead(statusCode, headers)
              if (stream) {
                stream.pipe(res)
              } else {
                res.end(body)
              }
            })
            .listen(0, function (err) {
              err ? reject(err) : resolve(this.address().port)
            }))
      )
    })

    after(async () => {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    })

    // NOTE this test also verifies that the SSH URL is still shown in the progress bar and error message
    it('should throw meaningful error when cannot connect to SSH repository', async () => {
      const oldSshAuthSock = process.env.SSH_AUTH_SOCK
      delete process.env.SSH_AUTH_SOCK
      const url = 'git@gitlab.com:invalid-repository.git'
      const expectedErrorMessage =
        'Remote does not support the "smart" HTTP protocol, ' +
        'and isomorphic-git does not support the "dumb" HTTP protocol, so they are incompatible (url: ' +
        url +
        ')'
      playbookSpec.content.sources.push({ url })
      await withMockStdout(async (lines) => {
        playbookSpec.runtime.quiet = false
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
        expect(lines[0]).to.include(url)
      })
      if (oldSshAuthSock) process.env.SSH_AUTH_SOCK = oldSshAuthSock
    }).timeout(this.timeout())

    it('should throw meaningful error if remote repository returns internal server error', async () => {
      const url = `http://localhost:${serverPort}/500/bar.git`
      const expectedErrorMessage = `HTTP Error: 500 Internal Server Error (url: ${url})`
      playbookSpec.content.sources.push({ url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred)
        .to.throw(expectedErrorMessage)
        .with.property('stack')
        .that.includes('Caused by: HTTPError: HTTP Error: 500 Internal Server Error')
    })

    it('should throw meaningful error if git client throws exception', async () => {
      const url = `http://localhost:${serverPort}/200/incomplete-ref-capabilities.git`
      playbookSpec.content.sources.push({ url })
      const commonErrorMessage = 'Expected "Two strings separated by \'\\x00\'" but got "ref"'
      const expectedErrorMessage = `${commonErrorMessage} (url: ${url})`
      const expectedCauseMessage = `AssertServerResponseFail: ${commonErrorMessage}`
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred)
        .to.throw(expectedErrorMessage)
        .with.property('stack')
        .that.includes('Caused by: ' + expectedCauseMessage)
    })

    it('should throw meaningful error if git server does not support required capabilities', async () => {
      const url = `http://localhost:${serverPort}/200/insufficient-capabilities.git`
      playbookSpec.content.sources.push({ url })
      const commonErrorMessage = 'Expected "Two strings separated by \' \'" but got "ref"'
      const expectedErrorMessage = `${commonErrorMessage} (url: ${url})`
      const expectedCauseMessage = `AssertServerResponseFail: ${commonErrorMessage}`
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred)
        .to.throw(expectedErrorMessage)
        .with.property('stack')
        .that.includes('Caused by: ' + expectedCauseMessage)
    })

    it('should throw meaningful error if git server returns empty response', async () => {
      const url = `http://localhost:${serverPort}/200/empty-response.git`
      playbookSpec.content.sources.push({ url })
      const expectedErrorMessage = `Unknown EmptyServerResponseFail: See cause (url: ${url})`
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred)
        .to.throw(expectedErrorMessage)
        .with.property('stack')
        .that.includes('Caused by: EmptyServerResponseFail: Empty response from git server.')
    })

    it('should throw meaningful error if remote repository URL not found', async () => {
      const url = `http://localhost:${serverPort}/404/invalid-repository.git`
      const expectedErrorMessage = 'Content repository not found (url: ' + url + ')'
      playbookSpec.content.sources.push({ url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred)
        .to.throw(expectedErrorMessage)
        .with.property('stack')
        .that.includes('Caused by: HTTPError: HTTP Error: 404 Not Found')
    })

    describe('should not append .git suffix to URL if git.ensureGitSuffix is disabled in playbook', () => {
      testRemote(async (repoBuilder) => {
        await initRepoWithFiles(repoBuilder)
        playbookSpec.git = { ensureGitSuffix: false }
        playbookSpec.content.sources.push({ url: repoBuilder.url.replace(/\.git$/, '') })
        const expectedErrorMessage = 'Content repository not found (url: ' + repoBuilder.url.replace(/\.git$/, '') + ')'
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
      })
    })

    it('should throw meaningful error if credentials are insufficient', async () => {
      const url = `http://localhost:${serverPort}/401/invalid-repository.git`
      const expectedErrorMessage = 'Content repository not found or requires credentials (url: ' + url + ')'
      playbookSpec.content.sources.push({ url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
    })

    it('should preserve stack of original git error', async () => {
      const url = `http://localhost:${serverPort}/401/invalid-repository.git`
      const expectedErrorMessage = 'Content repository not found or requires credentials (url: ' + url + ')'
      playbookSpec.content.sources.push({ url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred)
        .to.throw(expectedErrorMessage)
        .with.property('stack')
        .that.includes('Caused by: HTTPError: HTTP Error: 401 HTTP Basic: Access Denied')
    })

    it('should not show auth information in progress bar label', async () => {
      const url = `http://0123456789@localhost:${serverPort}/401/invalid-repository.git`
      const sanitizedUrl = `http://localhost:${serverPort}/401/invalid-repository.git`
      const expectedErrorMessage = 'Content repository not found or requires credentials (url: ' + sanitizedUrl + ')'
      return withMockStdout(async (lines) => {
        playbookSpec.runtime.quiet = false
        playbookSpec.content.sources.push({ url })
        const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
        expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
        expect(lines[0]).not.to.include('0123456789@')
      }, GIT_OPERATION_LABEL_LENGTH + 1 + url.length * 2)
    })

    it('should throw meaningful error if server returns unexpected error', async () => {
      const url = `http://localhost:${serverPort}/301/invalid-repository.git`
      const expectedErrorMessage =
        'Remote does not support the "smart" HTTP protocol, ' +
        'and isomorphic-git does not support the "dumb" HTTP protocol, so they are incompatible (url: ' +
        url +
        ')'
      playbookSpec.content.sources.push({ url })
      const aggregateContentDeferred = await deferExceptions(aggregateContent, playbookSpec)
      expect(aggregateContentDeferred).to.throw(expectedErrorMessage)
    })
  })
})
