/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const fs = require('fs-extra')
const http = require('http')
const loadUi = require('@antora/ui-loader')
const ospath = require('path')

const CWD = process.cwd()
const WORK_DIR = ospath.join(__dirname, 'work')

function testAll (archive, testFunction) {
  const playbook = { ui: { startPath: '' } }

  it('with relative bundle path', () => {
    playbook.ui.bundle = ospath.relative(WORK_DIR, ospath.resolve(__dirname, 'fixtures', archive))
    return testFunction(playbook)
  })

  it('with absolute bundle path', () => {
    playbook.ui.bundle = ospath.resolve(__dirname, 'fixtures', archive)
    return testFunction(playbook)
  })

  it('with remote bundle URI', () => {
    playbook.ui.bundle = 'http://localhost:1337/' + archive
    return testFunction(playbook)
  })
}

describe('loadUi()', () => {
  const expectedFilePaths = [
    'css/one.css',
    'css/two.css',
    'fonts/Roboto-Medium.ttf',
    'helpers/and.js',
    'helpers/or.js',
    'images/close.svg',
    'images/search.svg',
    'layouts/404.hbs',
    'layouts/default.hbs',
    'partials/footer.hbs',
    'partials/header.hbs',
    'scripts/01-one.js',
    'scripts/02-two.js',
  ]

  let server

  const clean = (fin) => {
    process.chdir(CWD)
    const timeout = 5000
    let retry = true
    let start = Date.now()
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
    clean()
    server = http
      .createServer((request, response) => {
        fs.readFile(ospath.resolve(ospath.join(__dirname, 'fixtures', request.url)), (err, content) => {
          if (err) {
            throw err
          }
          const contentType = 'application/zip'
          response.writeHead(200, { 'Content-Type': contentType })
          response.end(content, 'utf-8')
        })
      })
      .listen(1337)
  })

  afterEach(() => {
    clean(true)
    server.close()
  })

  describe('should load all files in the UI bundle', () => {
    testAll('the-ui-bundle.zip', async (playbook) => {
      const uiCatalog = await loadUi(playbook)
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
      const relativePaths = files.map((file) => file.relative)
      expect(paths).to.eql(relativePaths)
    })
  })

  describe('should load all files in the bundle from specified startPath', () => {
    describe('when startPath is absolute', () => {
      testAll('the-ui-bundle-with-start-path.zip', async (playbook) => {
        playbook.ui.startPath = '/the-ui-bundle'
        const uiCatalog = await loadUi(playbook)
        const paths = uiCatalog.getFiles().map((file) => file.path)
        expect(paths).to.have.members(expectedFilePaths)
        expect(paths).not.to.include('the-ui-bundle.txt')
      })
    })

    describe('when startPath is relative', () => {
      testAll('the-ui-bundle-with-start-path.zip', async (playbook) => {
        playbook.ui.startPath = 'the-ui-bundle'
        const uiCatalog = await loadUi(playbook)
        const paths = uiCatalog.getFiles().map((file) => file.path)
        expect(paths).to.have.members(expectedFilePaths)
        expect(paths).not.to.include('the-ui-bundle.txt')
      })
    })

    describe('when startPath has trailing slash', () => {
      testAll('the-ui-bundle-with-start-path.zip', async (playbook) => {
        playbook.ui.startPath = 'the-ui-bundle/'
        const uiCatalog = await loadUi(playbook)
        const paths = uiCatalog.getFiles().map((file) => file.path)
        expect(paths).to.have.members(expectedFilePaths)
        expect(paths).not.to.include('the-ui-bundle.txt')
      })
    })
  })

  describe('findByType()', () => {
    describe('should discover helpers', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        const uiCatalog = await loadUi(playbook)
        const helpers = uiCatalog.findByType('helper')
        helpers.forEach(({ type }) => expect(type).to.equal('helper'))
        const helperPaths = helpers.map((file) => file.path)
        expect(helperPaths).to.have.members(['helpers/and.js', 'helpers/or.js'])
      })
    })

    describe('should discover layouts', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        const uiCatalog = await loadUi(playbook)
        const layouts = uiCatalog.findByType('layout')
        layouts.forEach(({ type }) => expect(type).to.equal('layout'))
        const layoutPaths = layouts.map((file) => file.path)
        expect(layoutPaths).to.have.members(['layouts/404.hbs', 'layouts/default.hbs'])
      })
    })

    describe('should discover partials', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        const uiCatalog = await loadUi(playbook)
        const partials = uiCatalog.findByType('partial')
        partials.forEach(({ type }) => expect(type).to.equal('partial'))
        const partialPaths = partials.map((file) => file.path)
        expect(partialPaths).to.have.members(['partials/footer.hbs', 'partials/header.hbs'])
      })
    })

    describe('should discover assets', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        const uiCatalog = await loadUi(playbook)
        const uiAssets = uiCatalog.findByType('asset')
        uiAssets.forEach(({ type }) => expect(type).to.equal('asset'))
        const uiAssetPaths = uiAssets.map((file) => file.path)
        expect(uiAssetPaths).to.have.members([
          'css/one.css',
          'css/two.css',
          'fonts/Roboto-Medium.ttf',
          'images/close.svg',
          'images/search.svg',
          'scripts/01-one.js',
          'scripts/02-two.js',
        ])
      })
    })

    describe('should differentiate static files from assets', () => {
      testAll('the-ui-bundle-with-static-files.zip', async (playbook) => {
        const uiCatalog = await loadUi(playbook)
        const filepaths = uiCatalog.getFiles().map((file) => file.path)
        expect(filepaths).not.to.include('ui.yml')
        const uiAssets = uiCatalog.findByType('asset')
        uiAssets.forEach(({ type }) => expect(type).to.equal('asset'))
        const uiAssetPaths = uiAssets.map((file) => file.path)
        expect(uiAssetPaths).to.have.members([
          'css/one.css',
          'css/two.css',
          'fonts/Roboto-Medium.ttf',
          'foo/bar/hello.json',
          'images/close.svg',
          'images/search.svg',
          'scripts/01-one.js',
          'scripts/02-two.js',
        ])
        const staticFiles = uiCatalog.findByType('static')
        staticFiles.forEach(({ type }) => expect(type).to.equal('static'))
        const staticFilePaths = staticFiles.map((file) => file.path)
        expect(staticFilePaths).to.have.members(['foo/two.xml', 'foo/bar/one.xml', 'humans.txt'])
      })
    })

    describe('should discover static files when specified with single glob string', () => {
      testAll('the-ui-bundle-with-static-files-single-glob.zip', async (playbook) => {
        const uiCatalog = await loadUi(playbook)
        const staticFiles = uiCatalog.findByType('static')
        staticFiles.forEach(({ type }) => expect(type).to.equal('static'))
        const staticFilePaths = staticFiles.map((file) => file.path)
        expect(staticFilePaths).to.have.members(['foo/two.xml', 'foo/bar/one.xml'])
      })
    })
  })

  describe('should not set the out property on helpers', () => {
    testAll('the-ui-bundle.zip', async (playbook) => {
      const uiCatalog = await loadUi(playbook)
      const helpers = uiCatalog.findByType('helper')
      helpers.forEach((file) => {
        expect(file).not.to.have.property('out')
      })
    })
  })

  describe('should not set the out property on layouts', () => {
    testAll('the-ui-bundle.zip', async (playbook) => {
      const uiCatalog = await loadUi(playbook)
      const layouts = uiCatalog.findByType('layout')
      layouts.forEach((file) => {
        expect(file).not.to.have.property('out')
      })
    })
  })

  describe('should not set the out property on partials', () => {
    testAll('the-ui-bundle.zip', async (playbook) => {
      const uiCatalog = await loadUi(playbook)
      const partials = uiCatalog.findByType('partial')
      partials.forEach((file) => {
        expect(file).not.to.have.property('out')
      })
    })
  })

  describe('should set the out property on assets', () => {
    testAll('the-ui-bundle.zip', async (playbook) => {
      const uiCatalog = await loadUi(playbook)
      const uiAssets = uiCatalog.findByType('asset')
      uiAssets.forEach((file) => {
        expect(file).to.have.property('out')
      })
      const script = uiAssets.find(({ path: p }) => p === 'scripts/01-one.js')
      expect(script.out).to.eql({
        dirname: '_/scripts',
        basename: '01-one.js',
        path: '_/scripts/01-one.js',
      })
    })
  })

  describe('should set the out property on assets relative to playbook.ui.outputDir', () => {
    describe('when outputDir is relative', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        playbook.ui.outputDir = '_ui'
        const uiCatalog = await loadUi(playbook)
        const uiAssets = uiCatalog.findByType('asset')
        uiAssets.forEach((file) => {
          expect(file).to.have.property('out')
        })
        const script = uiAssets.find(({ path }) => path === 'scripts/01-one.js')
        expect(script.out).to.eql({
          dirname: '_ui/scripts',
          basename: '01-one.js',
          path: '_ui/scripts/01-one.js',
        })
      })
    })

    describe('when outputDir is absolute', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        playbook.ui.outputDir = '/_ui'
        const uiCatalog = await loadUi(playbook)
        const uiAssets = uiCatalog.findByType('asset')
        uiAssets.forEach((file) => {
          expect(file).to.have.property('out')
        })
        const script = uiAssets.find(({ path }) => path === 'scripts/01-one.js')
        expect(script.out).to.eql({
          dirname: '_ui/scripts',
          basename: '01-one.js',
          path: '_ui/scripts/01-one.js',
        })
      })
    })
  })

  describe('should set the out property on static files', () => {
    testAll('the-ui-bundle-with-static-files.zip', async (playbook) => {
      const uiCatalog = await loadUi(playbook)
      const staticFiles = uiCatalog.findByType('static')
      staticFiles.forEach((file) => {
        expect(file).to.have.property('out')
      })
      const xml = staticFiles.find(({ path }) => path === 'foo/bar/one.xml')
      expect(xml.out).to.eql({
        dirname: 'foo/bar',
        basename: 'one.xml',
        path: 'foo/bar/one.xml',
      })
    })
  })

  it('should use a cache without needing remote access when url is the same', async () => {
    const playbook = {
      ui: {
        bundle: 'http://localhost:1337/the-ui-bundle.zip',
        startPath: '/',
      },
    }
    let uiCatalog = await loadUi(playbook)
    let paths = uiCatalog.getFiles().map((file) => file.path)
    expect(paths).to.have.members(expectedFilePaths)

    server.close()

    uiCatalog = await loadUi(playbook)
    paths = uiCatalog.getFiles().map((file) => file.path)
    expect(paths).to.have.members(expectedFilePaths)
  })
})
