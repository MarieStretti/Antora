/* eslint-env mocha */
'use strict'

const { deferExceptions, expect, removeSyncForce } = require('../../../test/test-utils')

const fs = require('fs-extra')
const getCacheDir = require('cache-directory')
const http = require('http')
const loadUi = require('@antora/ui-loader')
const os = require('os')
const ospath = require('path')

const { UI_CACHE_FOLDER } = require('@antora/ui-loader/lib/constants')
const CACHE_DIR = getCacheDir('antora-test')
const UI_CACHE_DIR = ospath.join(CACHE_DIR, UI_CACHE_FOLDER)
const CWD = process.cwd()
const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')
const WORK_DIR = ospath.join(__dirname, 'work')

describe('loadUi()', () => {
  const expectedFilePaths = [
    'css/one.css',
    'css/two.css',
    'font/Roboto-Medium.ttf',
    'helpers/and.js',
    'helpers/or.js',
    'img/close.svg',
    'img/search.svg',
    'layouts/404.hbs',
    'layouts/default.hbs',
    'partials/footer.hbs',
    'partials/head.hbs',
    'partials/header.hbs',
    'js/01-one.js',
    'js/02-two.js',
  ]

  let server

  const prefixPath = (prefix, path_) => [prefix, path_].join(ospath.sep)

  const testAll = (archive, testBlock) => {
    const makeTest = (bundle) => testBlock({ ui: { bundle } })
    it('with dot-relative bundle path', () =>
      makeTest(prefixPath('.', ospath.relative(WORK_DIR, ospath.join(FIXTURES_DIR, archive)))))
    it('with absolute bundle path', () => makeTest(ospath.join(FIXTURES_DIR, archive)))
    it('with remote bundle URI', () => makeTest('http://localhost:1337/' + archive))
  }

  const clean = (fin) => {
    process.chdir(CWD)
    removeSyncForce(CACHE_DIR)
    removeSyncForce(WORK_DIR)
    if (!fin) {
      fs.ensureDirSync(WORK_DIR)
      process.chdir(WORK_DIR)
    }
  }

  beforeEach(() => {
    clean()
    server = http
      .createServer((request, response) => {
        fs.readFile(ospath.join(__dirname, 'fixtures', request.url), (err, content) => {
          if (err) {
            response.writeHead(404, { 'Content-Type': 'text/html' })
            response.end('<!DOCTYPE html><html><body>Not Found</body></html>', 'utf8')
          } else {
            response.writeHead(200, { 'Content-Type': 'application/zip' })
            response.end(content)
          }
        })
      })
      .listen(1337)
  })

  afterEach(() => {
    clean(true)
    server.close()
  })

  describe('should throw error if bundle cannot be found', () => {
    testAll('no-such-bundle.zip', async (playbook) => {
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      if (playbook.ui.bundle.startsWith('http://')) {
        expect(loadUiDeferred).to.throw('404')
      } else {
        expect(loadUiDeferred).to.throw('does not exist')
      }
    })
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

  describe('should expand local bundle path', () => {
    it('should append unanchored bundle path to cwd', async () => {
      const playbookDir = ospath.join(WORK_DIR, 'some-other-folder')
      const playbook = { dir: playbookDir }
      fs.ensureDirSync(playbookDir)
      const bundleFixture = ospath.join(FIXTURES_DIR, 'the-ui-bundle.zip')
      fs.outputFileSync('the-ui-bundle.zip', fs.readFileSync(bundleFixture))
      playbook.ui = { bundle: 'the-ui-bundle.zip' }
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })

    it('should expand leading . segment in bundle path to playbook dir', async () => {
      const playbook = { dir: WORK_DIR }
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      playbook.ui = {
        bundle: prefixPath('.', ospath.relative(WORK_DIR, ospath.join(FIXTURES_DIR, 'the-ui-bundle.zip'))),
      }
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })

    it('should expand leading ~ segment in bundle path to user home', async () => {
      const playbook = {}
      playbook.ui = {
        bundle: prefixPath('~', ospath.relative(os.homedir(), ospath.join(FIXTURES_DIR, 'the-ui-bundle.zip'))),
      }
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })

    it('should expand leading ~+ segment in bundle path to cwd', async () => {
      const playbook = { dir: WORK_DIR }
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      playbook.ui = {
        bundle: prefixPath('~+', ospath.relative(newWorkDir, ospath.join(FIXTURES_DIR, 'the-ui-bundle.zip'))),
      }
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })
  })

  describe('should locate bundle when cwd and playbook dir are different', () => {
    testAll('the-ui-bundle.zip', async (playbook) => {
      playbook.dir = WORK_DIR
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })
  })

  describe('should load all files in the bundle from specified startPath', () => {
    describe('when startPath is /', () => {
      testAll('the-ui-bundle.zip', async (playbook) => {
        playbook.ui.startPath = '/'
        const uiCatalog = await loadUi(playbook)
        const paths = uiCatalog.getFiles().map((file) => file.path)
        expect(paths).to.have.members(expectedFilePaths)
      })
    })

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

  describe('should load supplemental files', () => {
    let playbook
    const expectedFilePathsWithSupplemental = expectedFilePaths.concat('css/extra.css', 'img/icon.png')
    const supplementalFileContents = ['partials/head.hbs', 'css/extra.css', 'img/icon.png'].reduce((accum, path_) => {
      accum[path_] = fs.readFileSync(ospath.join(FIXTURES_DIR, 'supplemental-files', path_))
      return accum
    }, {})

    const verifySupplementalFiles = (uiCatalog, compareBuffers = true) => {
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePathsWithSupplemental)
      files.forEach((file) => {
        const path_ = file.path
        if (path_ in supplementalFileContents) {
          if (compareBuffers) {
            expect(file.contents).to.eql(supplementalFileContents[path_])
          } else {
            expect(file.contents.toString()).to.equal(supplementalFileContents[path_].toString())
          }
        }
      })
    }

    beforeEach(() => {
      playbook = { ui: { bundle: ospath.join(FIXTURES_DIR, 'the-ui-bundle.zip') } }
    })

    it('throws error when directory does not exist', async () => {
      playbook.ui.supplementalFiles = ospath.join(FIXTURES_DIR, 'does-not-exist')
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(loadUiDeferred).to.throw('problem encountered')
    })

    it('from absolute directory', async () => {
      playbook.ui.supplementalFiles = ospath.join(FIXTURES_DIR, 'supplemental-files')
      verifySupplementalFiles(await loadUi(playbook))
    })

    it('from dot-relative directory', async () => {
      playbook.ui.supplementalFiles = prefixPath(
        '.',
        ospath.relative(WORK_DIR, ospath.join(FIXTURES_DIR, 'supplemental-files'))
      )
      verifySupplementalFiles(await loadUi(playbook))
    })

    it('from dot-relative directory when playbook dir does not match cwd', async () => {
      playbook.dir = WORK_DIR
      playbook.ui.supplementalFiles = prefixPath(
        '.',
        ospath.relative(WORK_DIR, ospath.join(FIXTURES_DIR, 'supplemental-files'))
      )
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      verifySupplementalFiles(uiCatalog)
    })

    it('skips supplemental files when scan finds no files', async () => {
      const emptyDir = ospath.join(WORK_DIR, 'empty-directory')
      fs.ensureDirSync(emptyDir)
      playbook.ui.supplementalFiles = 'empty-directory'
      const uiCatalog = await loadUi(playbook)
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })

    it('from files with string contents', async () => {
      playbook.ui.supplementalFiles = [
        {
          path: 'partials/head.hbs',
          contents: supplementalFileContents['partials/head.hbs'].toString(),
        },
        {
          path: 'css/extra.css',
          contents: supplementalFileContents['css/extra.css'].toString(),
        },
        {
          path: 'img/icon.png',
          contents: supplementalFileContents['img/icon.png'].toString(),
        },
      ]
      verifySupplementalFiles(await loadUi(playbook), false)
    })

    it('from file with string contents that does not contain any newline characters', async () => {
      playbook.ui.supplementalFiles = [
        {
          path: 'partials/head.hbs',
          contents: '<meta name="google-site-verification" content="abcdefghijklmnopqrstuvwxyz">',
        },
      ]
      const uiCatalog = await loadUi(playbook)
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
      const head = files.find((file) => file.path === 'partials/head.hbs')
      expect(head).to.exist()
      expect(head.contents.toString()).to.include('google-site-verification')
    })

    it('throws error when file does not exist', async () => {
      playbook.ui.supplementalFiles = [
        {
          path: 'partials/head.hbs',
          contents: ospath.join(FIXTURES_DIR, 'does-not-exist/head.hbs'),
        },
      ]
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(loadUiDeferred).to.throw('no such file')
    })

    it('from files with absolute paths', async () => {
      playbook.ui.supplementalFiles = [
        {
          path: 'partials/head.hbs',
          contents: ospath.join(FIXTURES_DIR, 'supplemental-files/partials/head.hbs'),
        },
        {
          path: 'css/extra.css',
          contents: ospath.join(FIXTURES_DIR, 'supplemental-files/css/extra.css'),
        },
        {
          path: 'img/icon.png',
          contents: ospath.join(FIXTURES_DIR, 'supplemental-files/img/icon.png'),
        },
      ]
      verifySupplementalFiles(await loadUi(playbook))
    })

    it('from files with relative paths', async () => {
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      const supplementalFilesDir = ospath.join(FIXTURES_DIR, 'supplemental-files')
      playbook.dir = WORK_DIR
      playbook.ui.supplementalFiles = [
        {
          path: 'partials/head.hbs',
          contents: ospath.relative(newWorkDir, ospath.join(supplementalFilesDir, 'partials/head.hbs')),
        },
        {
          path: 'css/extra.css',
          contents: ospath.relative(newWorkDir, ospath.join(supplementalFilesDir, 'css/extra.css')),
        },
        {
          path: 'img/icon.png',
          contents: ospath.relative(newWorkDir, ospath.join(supplementalFilesDir, 'img/icon.png')),
        },
      ]
      verifySupplementalFiles(await loadUi(playbook))
    })

    it('from files relative to user home', async () => {
      const supplementalFilesDir = ospath.join(FIXTURES_DIR, 'supplemental-files')
      playbook.ui.supplementalFiles = ['partials/head.hbs', 'css/extra.css', 'img/icon.png'].map((path_) => ({
        path: path_,
        contents: prefixPath('~', ospath.relative(os.homedir(), ospath.join(supplementalFilesDir, path_))),
      }))
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      verifySupplementalFiles(uiCatalog)
    })

    it('from files with dot-relative paths when playbook dir does not match cwd', async () => {
      const supplementalFilesDir = ospath.join(FIXTURES_DIR, 'supplemental-files')
      playbook.dir = WORK_DIR
      playbook.ui.supplementalFiles = ['partials/head.hbs', 'css/extra.css', 'img/icon.png'].map((path_) => ({
        path: path_,
        contents: prefixPath('.', ospath.relative(WORK_DIR, ospath.join(supplementalFilesDir, path_))),
      }))
      const newWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
      fs.ensureDirSync(newWorkDir)
      process.chdir(newWorkDir)
      let uiCatalog
      const loadUiDeferred = await deferExceptions(loadUi, playbook)
      expect(() => (uiCatalog = loadUiDeferred())).to.not.throw()
      verifySupplementalFiles(uiCatalog)
    })

    it('skips supplemental files when empty', async () => {
      playbook.ui.supplementalFiles = []
      const uiCatalog = await loadUi(playbook)
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    })

    it('creates empty file when contents of file is not specified', async () => {
      playbook.ui.supplementalFiles = [{ path: 'partials/head.hbs' }]
      const uiCatalog = await loadUi(playbook)
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
      const head = files.find((file) => file.path === 'partials/head.hbs')
      expect(head).to.exist()
      expect(head.contents.toString()).to.be.empty()
    })

    it('skips entry when path is not specified', async () => {
      playbook.ui.supplementalFiles = [{ contents: 'this file is ignored' }]
      const uiCatalog = await loadUi(playbook)
      const files = uiCatalog.getFiles()
      const paths = files.map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
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
        expect(partialPaths).to.have.members(['partials/footer.hbs', 'partials/head.hbs', 'partials/header.hbs'])
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
          'font/Roboto-Medium.ttf',
          'img/close.svg',
          'img/search.svg',
          'js/01-one.js',
          'js/02-two.js',
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
      const script = uiAssets.find(({ path: p }) => p === 'js/01-one.js')
      expect(script).to.exist()
      expect(script.out).to.eql({
        dirname: '_/js',
        basename: '01-one.js',
        path: '_/js/01-one.js',
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
        const script = uiAssets.find(({ path }) => path === 'js/01-one.js')
        expect(script).to.exist()
        expect(script.out).to.eql({
          dirname: '_ui/js',
          basename: '01-one.js',
          path: '_ui/js/01-one.js',
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
        const script = uiAssets.find(({ path }) => path === 'js/01-one.js')
        expect(script).to.exist()
        expect(script.out).to.eql({
          dirname: '_ui/js',
          basename: '01-one.js',
          path: '_ui/js/01-one.js',
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

  it('should take bundle from cache when url is the same', async () => {
    const playbook = {
      ui: { bundle: 'http://localhost:1337/the-ui-bundle.zip' },
    }
    let uiCatalog = await loadUi(playbook)
    expect(CACHE_DIR)
      .to.be.a.directory()
      .with.subDirs([UI_CACHE_FOLDER])
    expect(UI_CACHE_DIR)
      .to.be.a.directory()
      .and.not.be.empty()
    let paths = uiCatalog.getFiles().map((file) => file.path)
    expect(paths).to.have.members(expectedFilePaths)

    server.close()

    uiCatalog = await loadUi(playbook)
    paths = uiCatalog.getFiles().map((file) => file.path)
    expect(paths).to.have.members(expectedFilePaths)
  })

  describe('custom cache dir', () => {
    const testCacheDir = async (cacheDir, dir) => {
      const customCacheDir = ospath.join(WORK_DIR, '.antora-cache')
      const customUiCacheDir = ospath.join(customCacheDir, UI_CACHE_FOLDER)
      const playbook = {
        dir,
        runtime: { cacheDir },
        ui: { bundle: 'http://localhost:1337/the-ui-bundle.zip' },
      }
      let uiCatalog = await loadUi(playbook)
      expect(UI_CACHE_DIR).to.not.be.a.path()
      expect(customCacheDir)
        .to.be.a.directory()
        .with.subDirs([UI_CACHE_FOLDER])
      expect(customUiCacheDir)
        .to.be.a.directory()
        .and.not.be.empty()
      let paths = uiCatalog.getFiles().map((file) => file.path)
      expect(paths).to.have.members(expectedFilePaths)
    }

    it('should use custom cache dir relative to cwd (implicit)', async () => {
      await testCacheDir('.antora-cache')
    })

    it('should use custom cache dir relative to cwd (explicit)', async () => {
      await testCacheDir(ospath.join('~+', '.antora-cache'))
    })

    it('should use custom cache dir relative to directory of playbook file', async () => {
      process.chdir(os.tmpdir())
      await testCacheDir('./.antora-cache', WORK_DIR)
    })

    it('should use custom cache dir relative to user home', async () => {
      process.chdir(os.tmpdir())
      await testCacheDir('~' + ospath.sep + ospath.relative(os.homedir(), ospath.join(WORK_DIR, '.antora-cache')))
    })
  })
})
