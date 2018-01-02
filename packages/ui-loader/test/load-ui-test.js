/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const fs = require('fs-extra')
const http = require('http')
const loadUi = require('@antora/ui-loader')
const path = require('path')

const CWD = process.cwd()
const WORK_DIR = path.resolve(__dirname, 'work')

function testAll (archive, testFunction) {
  const playbook = { ui: { startPath: '' } }

  it('with relative bundle path', () => {
    playbook.ui.bundle = path.relative(process.cwd(), path.resolve(__dirname, path.join('fixtures', archive)))
    return testFunction(playbook)
  })

  it('with absolute bundle path', () => {
    playbook.ui.bundle = path.resolve(__dirname, path.join('fixtures', archive))
    return testFunction(playbook)
  })

  it('with remote bundle URI', () => {
    playbook.ui.bundle = 'http://localhost:1337' + path.join('/', archive)
    return testFunction(playbook)
  })
}

function cleanCache () {
  fs.removeSync(WORK_DIR)
  process.chdir(CWD)
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

  beforeEach(() => {
    cleanCache()
    fs.ensureDirSync(WORK_DIR)
    process.chdir(WORK_DIR)
    server = http
      .createServer((request, response) => {
        const filePath = path.resolve(__dirname, path.join('fixtures', request.url))
        fs.readFile(filePath, (error, content) => {
          if (error) {
            throw error
          }
          const contentType = 'application/zip'
          response.writeHead(200, { 'Content-Type': contentType })
          response.end(content, 'utf-8')
        })
      })
      .listen(1337)
  })

  afterEach(() => {
    server.close()
    cleanCache()
  })

  describe('should load all files in the UI bundle', () => {
    testAll('the-ui-bundle.zip', (playbook) => {
      return expect(loadUi(playbook))
        .to.be.fulfilled()
        .then((uiCatalog) => {
          const files = uiCatalog.getFiles()
          const paths = files.map((file) => file.path)
          expect(paths).to.have.members(expectedFilePaths)
          const relativePaths = files.map((file) => file.relative)
          expect(paths).to.eql(relativePaths)
        })
    })
  })

  describe('should load all files in the bundle from specified startPath', () => {
    describe('when startPath is absolute', () => {
      testAll('the-ui-bundle-with-start-path.zip', (playbook) => {
        playbook.ui.startPath = '/the-ui-bundle'
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const paths = uiCatalog.getFiles().map((file) => file.path)
            expect(paths).to.have.members(expectedFilePaths)
            expect(paths).not.to.include('the-ui-bundle.txt')
          })
      })
    })

    describe('when startPath is relative', () => {
      testAll('the-ui-bundle-with-start-path.zip', (playbook) => {
        playbook.ui.startPath = 'the-ui-bundle'
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const paths = uiCatalog.getFiles().map((file) => file.path)
            expect(paths).to.have.members(expectedFilePaths)
            expect(paths).not.to.include('the-ui-bundle.txt')
          })
      })
    })

    describe('when startPath has trailing slash', () => {
      testAll('the-ui-bundle-with-start-path.zip', (playbook) => {
        playbook.ui.startPath = 'the-ui-bundle/'
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const paths = uiCatalog.getFiles().map((file) => file.path)
            expect(paths).to.have.members(expectedFilePaths)
            expect(paths).not.to.include('the-ui-bundle.txt')
          })
      })
    })
  })

  describe('findByType()', () => {
    describe('should discover helpers', () => {
      testAll('the-ui-bundle.zip', (playbook) => {
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const helpers = uiCatalog.findByType('helper')
            helpers.forEach(({ type }) => expect(type).to.equal('helper'))
            const helperPaths = helpers.map((file) => file.path)
            expect(helperPaths).to.have.members(['helpers/and.js', 'helpers/or.js'])
          })
      })
    })

    describe('should discover layouts', () => {
      testAll('the-ui-bundle.zip', (playbook) => {
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const layouts = uiCatalog.findByType('layout')
            layouts.forEach(({ type }) => expect(type).to.equal('layout'))
            const layoutPaths = layouts.map((file) => file.path)
            expect(layoutPaths).to.have.members(['layouts/404.hbs', 'layouts/default.hbs'])
          })
      })
    })

    describe('should discover partials', () => {
      testAll('the-ui-bundle.zip', (playbook) => {
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const partials = uiCatalog.findByType('partial')
            partials.forEach(({ type }) => expect(type).to.equal('partial'))
            const partialPaths = partials.map((file) => file.path)
            expect(partialPaths).to.have.members(['partials/footer.hbs', 'partials/header.hbs'])
          })
      })
    })

    describe('should discover assets', () => {
      testAll('the-ui-bundle.zip', (playbook) => {
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
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
    })

    describe('should differentiate static files from assets', () => {
      testAll('the-ui-bundle-with-static-files.zip', (playbook) => {
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const filePaths = uiCatalog.getFiles().map((file) => file.path)
            expect(filePaths).not.to.include('ui.yml')
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
    })

    describe('should discover static files when specified with single glob string', () => {
      testAll('the-ui-bundle-with-static-files-single-glob.zip', (playbook) => {
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const staticFiles = uiCatalog.findByType('static')
            staticFiles.forEach(({ type }) => expect(type).to.equal('static'))
            const staticFilePaths = staticFiles.map((file) => file.path)
            expect(staticFilePaths).to.have.members(['foo/two.xml', 'foo/bar/one.xml'])
          })
      })
    })
  })

  describe('should not set the out property on helpers', () => {
    testAll('the-ui-bundle.zip', (playbook) => {
      return expect(loadUi(playbook))
        .to.be.fulfilled()
        .then((uiCatalog) => {
          const helpers = uiCatalog.findByType('helper')
          helpers.forEach((file) => {
            expect(file).not.to.have.property('out')
          })
        })
    })
  })

  describe('should not set the out property on layouts', () => {
    testAll('the-ui-bundle.zip', (playbook) => {
      return expect(loadUi(playbook))
        .to.be.fulfilled()
        .then((uiCatalog) => {
          const layouts = uiCatalog.findByType('layout')
          layouts.forEach((file) => {
            expect(file).not.to.have.property('out')
          })
        })
    })
  })

  describe('should not set the out property on partials', () => {
    testAll('the-ui-bundle.zip', (playbook) => {
      return expect(loadUi(playbook))
        .to.be.fulfilled()
        .then((uiCatalog) => {
          const partials = uiCatalog.findByType('partial')
          partials.forEach((file) => {
            expect(file).not.to.have.property('out')
          })
        })
    })
  })

  describe('should set the out property on assets', () => {
    testAll('the-ui-bundle.zip', (playbook) => {
      return expect(loadUi(playbook))
        .to.be.fulfilled()
        .then((uiCatalog) => {
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
  })

  describe('should set the out property on assets relative to playbook.ui.outputDir', () => {
    describe('when outputDir is relative', () => {
      testAll('the-ui-bundle.zip', (playbook) => {
        playbook.ui.outputDir = '_ui'
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
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

    describe('when outputDir is absolute', () => {
      testAll('the-ui-bundle.zip', (playbook) => {
        playbook.ui.outputDir = '/_ui'
        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
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
  })

  describe('should set the out property on static files', () => {
    testAll('the-ui-bundle-with-static-files.zip', (playbook) => {
      return expect(loadUi(playbook))
        .to.be.fulfilled()
        .then((uiCatalog) => {
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
  })

  it('should use a cache without needing remote access when url is the same', () => {
    const playbook = {
      ui: {
        bundle: 'http://localhost:1337/the-ui-bundle.zip',
        startPath: '/',
      },
    }
    return expect(loadUi(playbook))
      .to.be.fulfilled()
      .then((uiCatalog) => {
        const paths = uiCatalog.getFiles().map((file) => file.path)
        expect(paths).to.have.members(expectedFilePaths)

        server.close()

        return expect(loadUi(playbook))
          .to.be.fulfilled()
          .then((uiCatalog) => {
            const paths = uiCatalog.getFiles().map((file) => file.path)
            expect(paths).to.have.members(expectedFilePaths)
          })
      })
  })
})
