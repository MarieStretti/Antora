/* eslint-env mocha */
'use strict'

const { expect, heredoc } = require('../../../test/test-utils')

const buffer = require('gulp-buffer')
const File = require('vinyl')
const fs = require('fs-extra')
const os = require('os')
const ospath = require('path')
const publishSite = require('@antora/site-publisher')
const vzip = require('gulp-vinyl-zip')

const CWD = process.cwd()
const { DEFAULT_DEST_FS, DEFAULT_DEST_ARCHIVE } = require('@antora/site-publisher/lib/constants')
const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')
const HTML_RX = /<html>[\S\s]+<\/html>/
const TMP_DIR = os.tmpdir()
const WORK_DIR = ospath.join(__dirname, 'work')

describe('publishSite()', () => {
  let catalogs
  let playbook

  const createFile = (outPath, contents) => new File({ contents: Buffer.from(contents), out: { path: outPath } })

  const generateHtml = (title, content) => heredoc`
    <!DOCTYPE html>
    <html>
    <head>
    <title>${title}</title>
    </head>
    <body>
    <p>${content}</p>
    </body>
    </html>
  `

  const collectFilesFromZip = async (file) =>
    new Promise((resolve, reject) => {
      const accum = []
      vzip
        .src(file)
        .pipe(buffer())
        .on('data', (entry) => accum.push(entry))
        .on('error', reject)
        .on('end', () => resolve(accum))
    })

  const verifyArchiveOutput = (destFile) => {
    expect(destFile)
      .to.be.a.file()
      .and.not.empty()
    return collectFilesFromZip(destFile).then((files) => {
      expect(files).to.have.lengthOf(6)
      const filepaths = files.map((file) => file.path)
      expect(filepaths).to.have.members([
        ospath.join('the-component', '1.0', 'index.html'),
        ospath.join('the-component', '1.0', 'the-page.html'),
        ospath.join('the-component', '1.0', 'the-module', 'index.html'),
        ospath.join('the-component', '1.0', 'the-module', 'the-page.html'),
        ospath.join('_', 'css', 'site.css'),
        ospath.join('_', 'js', 'site.js'),
      ])
      const indexPath = ospath.join('the-component', '1.0', 'index.html')
      const indexFile = files.find((file) => file.path === indexPath)
      expect(indexFile.contents.toString()).to.match(HTML_RX)
    })
  }

  const verifyFsOutput = (destDir) => {
    destDir = ospath.resolve(destDir)
    expect(destDir)
      .to.be.a.directory()
      .with.subDirs(['_', 'the-component'])
    expect(ospath.join(destDir, '_/css/site.css'))
      .to.be.a.file()
      .with.contents('body { color: red; }')
    expect(ospath.join(destDir, '_/js/site.js'))
      .to.be.a.file()
      .with.contents(';(function () {})()')
    expect(ospath.join(destDir, 'the-component/1.0/index.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
    expect(ospath.join(destDir, 'the-component/1.0/the-page.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
    expect(ospath.join(destDir, 'the-component/1.0/the-module/index.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
    expect(ospath.join(destDir, 'the-component/1.0/the-module/the-page.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
  }

  beforeEach(() => {
    playbook = {
      output: {
        destinations: [],
      },
    }
    const contentCatalog = {
      getFiles: () => [
        createFile('the-component/1.0/index.html', generateHtml('Index (ROOT)', 'index')),
        createFile('the-component/1.0/the-page.html', generateHtml('The Page (ROOT)', 'the page')),
        createFile('the-component/1.0/the-module/index.html', generateHtml('Index (the-module)', 'index')),
        createFile('the-component/1.0/the-module/the-page.html', generateHtml('The Page (the-module)', 'the page')),
      ],
    }
    const uiCatalog = {
      getFiles: () => [
        createFile('_/css/site.css', 'body { color: red; }'),
        createFile('_/js/site.js', ';(function () {})()'),
      ],
    }
    catalogs = [contentCatalog, uiCatalog]
    fs.emptyDirSync(WORK_DIR)
    process.chdir(WORK_DIR)
  })

  after(() => {
    process.chdir(CWD)
    fs.removeSync(WORK_DIR)
  })

  it('should publish site to fs at default destination when no destinations are specified', async () => {
    playbook.output.destinations = undefined
    await publishSite(playbook, catalogs)
    verifyFsOutput(DEFAULT_DEST_FS)
    expect(playbook.output.destinations).to.be.undefined()
  })

  it('should publish site to fs at default destination', async () => {
    playbook.output.destinations.push({ provider: 'fs' })
    await publishSite(playbook, catalogs)
    verifyFsOutput(DEFAULT_DEST_FS)
  })

  it('should publish site to fs at specified relative destination', async () => {
    const destDir = 'path/to/_site'
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    verifyFsOutput(destDir)
  })

  it('should publish site to fs at specified absolute destination', async () => {
    const destDir = ospath.resolve('_site')
    expect(ospath.isAbsolute(destDir)).to.be.true()
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    verifyFsOutput(destDir)
  })

  it('should publish site to fs at specified destination override', async () => {
    const destDir = 'output'
    playbook.output.destinations.push(Object.freeze({ provider: 'fs' }))
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDir
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    verifyFsOutput(destDir)
    expect(playbook.output.destinations[0].path).to.not.exist()
  })

  it('should throw an error if cannot write to destination', async () => {
    const destDir = '_site'
    let awaitPublishSite
    fs.ensureFileSync(destDir)
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    try {
      await publishSite(playbook, catalogs)
      awaitPublishSite = () => {}
    } catch (err) {
      awaitPublishSite = () => {
        throw err
      }
    }
    expect(awaitPublishSite).to.throw('mkdir')
  })

  it('should publish site to archive at default destination', async () => {
    playbook.output.destinations.push({ provider: 'archive' })
    await publishSite(playbook, catalogs)
    await verifyArchiveOutput(DEFAULT_DEST_ARCHIVE)
  })

  it('should publish site to archive at specified destination', async () => {
    const destFile = 'path/to/site.zip'
    playbook.output.destinations.push({ provider: 'archive', path: destFile })
    await publishSite(playbook, catalogs)
    await verifyArchiveOutput(destFile)
  })

  it('should publish site to multiple fs directories', async () => {
    const destDir1 = 'site1'
    const destDir2 = 'site2'
    playbook.output.destinations.push({ provider: 'fs', path: destDir1 })
    playbook.output.destinations.push({ provider: 'fs', path: destDir2 })
    await publishSite(playbook, catalogs)
    verifyFsOutput(destDir1)
    verifyFsOutput(destDir2)
  })

  it('should replace path of first fs destination when destination override is specified', async () => {
    const destDir1 = 'build/site1'
    const destDir2 = 'build/site2'
    const destDirOverride = 'output'
    playbook.output.destinations.push(Object.freeze({ provider: 'fs', path: destDir1 }))
    playbook.output.destinations.push(Object.freeze({ provider: 'fs', path: destDir2 }))
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDirOverride
    await publishSite(playbook, catalogs)
    expect(destDir1).to.not.be.a.path()
    verifyFsOutput(destDirOverride)
    verifyFsOutput(destDir2)
    expect(playbook.output.destinations[0].path).to.equal(destDir1)
  })

  it('should publish site to multiple archive files', async () => {
    const destFile1 = 'site1.zip'
    const destFile2 = 'site2.zip'
    playbook.output.destinations.push({ provider: 'archive', path: destFile1 })
    playbook.output.destinations.push({ provider: 'archive', path: destFile2 })
    await publishSite(playbook, catalogs)
    await verifyArchiveOutput(destFile1)
    await verifyArchiveOutput(destFile2)
  })

  it('should publish site to fs directory and archive file', async () => {
    playbook.output.destinations.push({ provider: 'fs' })
    playbook.output.destinations.push({ provider: 'archive' })
    await publishSite(playbook, catalogs)
    verifyFsOutput(DEFAULT_DEST_FS)
    await verifyArchiveOutput(DEFAULT_DEST_ARCHIVE)
  })

  it('should not publish site if destinations is empty', async () => {
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    expect(WORK_DIR)
      .to.be.a.directory()
      .and.be.empty()
  })

  it('should publish site to fs at specified destination override when another destination is specified', async () => {
    const destDir = 'output'
    playbook.output.destinations.push(Object.freeze({ provider: 'archive' }))
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDir
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    verifyFsOutput(destDir)
    await verifyArchiveOutput(DEFAULT_DEST_ARCHIVE)
    expect(playbook.output.destinations).to.have.lengthOf(1)
  })

  it('should publish site to destination override even when destinations is empty', async () => {
    const destDir = 'output'
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDir
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    verifyFsOutput(destDir)
    expect(playbook.output.destinations).to.be.empty()
  })

  it('should clean all destinations if clean is set on output', async () => {
    const destDir1 = 'site1'
    const destDir2 = 'site2'
    const cleanMeFile1 = ospath.join(destDir1, 'clean-me.txt')
    const cleanMeFile2 = ospath.join(destDir2, 'clean-me.txt')
    playbook.output.destinations.push(Object.freeze({ provider: 'fs', path: destDir1 }))
    playbook.output.destinations.push(Object.freeze({ provider: 'fs', path: destDir2 }))
    playbook.output.clean = true
    fs.outputFileSync(cleanMeFile1, 'clean me!')
    fs.outputFileSync(cleanMeFile2, 'clean me!')
    await publishSite(playbook, catalogs)
    expect(cleanMeFile1).to.not.be.a.path()
    expect(cleanMeFile2).to.not.be.a.path()
    verifyFsOutput(destDir1)
    verifyFsOutput(destDir2)
    expect(playbook.output.destinations[0].clean).to.not.exist()
    expect(playbook.output.destinations[1].clean).to.not.exist()
  })

  it('should clean specified destinations', async () => {
    const destDir1 = 'site1'
    const destDir2 = 'site2'
    const leaveMeFile1 = ospath.join(destDir1, 'leave-me.txt')
    const cleanMeFile2 = ospath.join(destDir2, 'clean-me.txt')
    playbook.output.destinations.push({ provider: 'fs', path: destDir1 })
    playbook.output.destinations.push({ provider: 'fs', path: destDir2, clean: true })
    fs.outputFileSync(leaveMeFile1, 'leave me!')
    fs.outputFileSync(cleanMeFile2, 'clean me!')
    await publishSite(playbook, catalogs)
    expect(leaveMeFile1)
      .to.be.a.file()
      .with.contents('leave me!')
    expect(cleanMeFile2).to.not.be.a.path()
    verifyFsOutput(destDir1)
    verifyFsOutput(destDir2)
  })

  it('should load custom provider from absolute path', async () => {
    const destFile = 'report.txt'
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), 'reporter-abs.js')
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: ospath.resolve('reporter-abs.js'), path: destFile })
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    expect(destFile)
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should load custom provider from an absolute path outside working directory', async () => {
    const destFile = 'report.txt'
    const providerFile = ospath.join(TMP_DIR, `reporter-${process.pid}-${Date.now()}.js`)
    try {
      fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), providerFile)
      playbook.site = { title: 'The Site' }
      playbook.output.destinations.push({ provider: providerFile, path: destFile })
      await publishSite(playbook, catalogs)
      expect(DEFAULT_DEST_FS).to.not.be.a.path()
      expect(destFile)
        .to.be.a.file()
        .with.contents('published 6 files for The Site')
    } finally {
      fs.removeSync(providerFile)
    }
  })

  it('should load custom provider from relative path', async () => {
    const destFile = 'report.txt'
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), 'reporter-rel.js')
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: './reporter-rel', path: destFile })
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    expect(destFile)
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should load custom provider from node modules path', async () => {
    const destFile = 'report.txt'
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), 'node_modules/reporter-mod/index.js')
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: 'reporter-mod', path: destFile })
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    expect(destFile)
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should throw error if destination provider is unsupported', async () => {
    playbook.output.destinations.push({ provider: 'unknown' })
    let awaitPublishSite
    try {
      await publishSite(playbook, catalogs)
      awaitPublishSite = () => {}
    } catch (err) {
      awaitPublishSite = () => {
        throw err
      }
    }
    expect(awaitPublishSite).to.throw('Unsupported destination provider: unknown')
  })
})
