/* eslint-env mocha */
'use strict'

const { deferExceptions, expect, heredoc, removeSyncForce } = require('../../../test/test-utils')

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

  const createFile = (outPath, contents) => {
    const file = new File({ contents: Buffer.from(contents) })
    if (outPath) file.out = { path: outPath }
    return file
  }

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
    let destAbsFile
    if (ospath.isAbsolute(destFile) || !playbook.dir) {
      destAbsFile = destFile
    } else {
      expect(ospath.resolve(destFile)).to.not.be.a.path()
      destAbsFile = ospath.resolve(playbook.dir, destFile)
    }
    expect(destAbsFile)
      .to.be.a.file()
      .and.not.empty()
    return collectFilesFromZip(destAbsFile).then((files) => {
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
    let destAbsDir
    if (ospath.isAbsolute(destDir) || !playbook.dir) {
      destAbsDir = destDir
    } else {
      expect(ospath.resolve(destDir)).to.not.be.a.path()
      destAbsDir = ospath.resolve(playbook.dir, destDir)
    }
    expect(destAbsDir)
      .to.be.a.directory()
      .with.subDirs(['_', 'the-component'])
    expect(ospath.join(destAbsDir, '_/css/site.css'))
      .to.be.a.file()
      .with.contents('body { color: red; }')
    expect(ospath.join(destAbsDir, '_/js/site.js'))
      .to.be.a.file()
      .with.contents(';(function () {})()')
    expect(ospath.join(destAbsDir, 'the-component/1.0/index.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
    expect(ospath.join(destAbsDir, 'the-component/1.0/the-page.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
    expect(ospath.join(destAbsDir, 'the-component/1.0/the-module/index.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
    expect(ospath.join(destAbsDir, 'the-component/1.0/the-module/the-page.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
  }

  beforeEach(() => {
    playbook = {
      dir: WORK_DIR,
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
        createFile(undefined, 'included content'),
      ],
    }
    const uiCatalog = {
      getFiles: () => [
        createFile('_/css/site.css', 'body { color: red; }'),
        createFile('_/js/site.js', ';(function () {})()'),
      ],
    }
    catalogs = [contentCatalog, uiCatalog]
    // this sets process.cwd() to a known location, but not otherwise used
    process.chdir(__dirname)
    fs.emptyDirSync(WORK_DIR)
  })

  after(() => {
    process.chdir(CWD)
    removeSyncForce(WORK_DIR)
  })

  it('should publish site to fs at default path when no destinations are specified', async () => {
    playbook.output.destinations = undefined
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations).to.be.undefined()
    verifyFsOutput(DEFAULT_DEST_FS)
  })

  it('should publish site to fs at default path when no path is specified', async () => {
    playbook.output.destinations.push({ provider: 'fs' })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.be.undefined()
    verifyFsOutput(DEFAULT_DEST_FS)
  })

  it('should publish site to fs at relative path resolved from playbook dir', async () => {
    const destDir = './path/to/_site'
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destDir)
    verifyFsOutput(destDir)
  })

  it('should publish site to fs at relative path resolved from cwd if playbook dir not set', async () => {
    process.chdir(WORK_DIR)
    const destDir = './path/to/_site'
    delete playbook.dir
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destDir)
    verifyFsOutput(destDir)
  })

  it('should publish site to fs at relative path resolved from pwd', async () => {
    const workingDir = ospath.join(WORK_DIR, 'some-other-folder')
    fs.ensureDirSync(workingDir)
    process.chdir(workingDir)
    const destDir = 'path/to/_site'
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destDir)
    verifyFsOutput(ospath.join('some-other-folder', destDir))
  })

  it('should publish site to fs at path relative to user home', async () => {
    const destRelDir = ospath.relative(os.homedir(), ospath.join(playbook.dir, 'path/to/site'))
    const destAbsDir = ospath.join(os.homedir(), destRelDir)
    const destDir = '~' + ospath.sep + destRelDir
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destDir)
    verifyFsOutput(destAbsDir)
  })

  it('should publish site to fs at absolute path', async () => {
    const destDir = ospath.resolve(playbook.dir, '_site')
    expect(ospath.isAbsolute(destDir)).to.be.true()
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destDir)
    verifyFsOutput(destDir)
  })

  it('should publish site to fs at destination path override', async () => {
    const destDir = './output'
    playbook.output.destinations.push(Object.freeze({ provider: 'fs' }))
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDir
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.not.exist()
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    verifyFsOutput(destDir)
  })

  it('should throw an error if cannot write to destination path', async () => {
    const destDir = './_site'
    // NOTE put a file in our way
    fs.ensureFileSync(ospath.resolve(playbook.dir, destDir))
    playbook.output.destinations.push({ provider: 'fs', path: destDir })
    const publishSiteDeferred = await deferExceptions(publishSite, playbook, catalogs)
    expect(publishSiteDeferred).to.throw('mkdir')
  })

  it('should publish a large number of files', async () => {
    const contentCatalog = catalogs[0]
    const files = contentCatalog.getFiles()
    const numPages = 350
    for (let i = 1; i <= numPages; i++) {
      const contents = `<span>page ${i}</span>\n`.repeat(i)
      files.push(createFile('the-component/1.0/page-' + i + '.html', generateHtml('Page ' + i, contents)))
    }
    contentCatalog.getFiles = () => files
    playbook.output.destinations.push({ provider: 'fs' })
    await publishSite(playbook, catalogs)
    verifyFsOutput(DEFAULT_DEST_FS)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS, 'the-component/1.0/page-' + numPages + '.html'))
      .to.be.a.file()
      .with.contents.that.match(HTML_RX)
  })

  it('should publish site to archive at default path if no path is specified', async () => {
    playbook.output.destinations.push({ provider: 'archive' })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.be.undefined()
    await verifyArchiveOutput(DEFAULT_DEST_ARCHIVE)
  })

  it('should publish site to archive at relative path resolved from playbook dir', async () => {
    const destFile = './path/to/site.zip'
    playbook.output.destinations.push({ provider: 'archive', path: destFile })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destFile)
    await verifyArchiveOutput(destFile)
  })

  it('should publish site to archive at relative path resolved from cwd if playbook dir not set', async () => {
    process.chdir(WORK_DIR)
    const destFile = './path/to/site.zip'
    delete playbook.dir
    playbook.output.destinations.push({ provider: 'archive', path: destFile })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destFile)
    await verifyArchiveOutput(destFile)
  })

  it('should publish site to archive at relative path resolved from pwd', async () => {
    const workingDir = ospath.join(WORK_DIR, 'some-other-folder')
    fs.ensureDirSync(workingDir)
    process.chdir(workingDir)
    const destFile = 'path/to/site.zip'
    playbook.output.destinations.push({ provider: 'archive', path: destFile })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destFile)
    await verifyArchiveOutput(ospath.join('some-other-folder', destFile))
  })

  it('should publish site to archive relative to user home', async () => {
    const destRelFile = ospath.relative(os.homedir(), ospath.join(playbook.dir, 'path/to/site.zip'))
    const destAbsFile = ospath.join(os.homedir(), destRelFile)
    const destFile = '~' + ospath.sep + destRelFile
    playbook.output.destinations.push({ provider: 'archive', path: destFile })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destFile)
    await verifyArchiveOutput(destAbsFile)
  })

  it('should publish site to archive at absolute path', async () => {
    const destFile = ospath.resolve(playbook.dir, 'path/to/site.zip')
    expect(ospath.isAbsolute(destFile)).to.be.true()
    playbook.output.destinations.push({ provider: 'archive', path: destFile })
    await publishSite(playbook, catalogs)
    expect(playbook.output.destinations[0].path).to.equal(destFile)
    await verifyArchiveOutput(destFile)
  })

  it('should publish site to multiple fs directories', async () => {
    const destDir1 = './site1'
    const destDir2 = './site2'
    playbook.output.destinations.push({ provider: 'fs', path: destDir1 })
    playbook.output.destinations.push({ provider: 'fs', path: destDir2 })
    await publishSite(playbook, catalogs)
    verifyFsOutput(destDir1)
    verifyFsOutput(destDir2)
  })

  it('should replace path of first fs destination when destination override is specified', async () => {
    const destDir1 = './build/site1'
    const destDir2 = './build/site2'
    const destDirOverride = './output'
    playbook.output.destinations.push(Object.freeze({ provider: 'fs', path: destDir1 }))
    playbook.output.destinations.push(Object.freeze({ provider: 'fs', path: destDir2 }))
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDirOverride
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, destDir1)).to.not.be.a.path()
    verifyFsOutput(destDirOverride)
    verifyFsOutput(destDir2)
    expect(playbook.output.destinations[0].path).to.equal(destDir1)
  })

  it('should publish site to multiple archive files', async () => {
    const destFile1 = './site1.zip'
    const destFile2 = './site2.zip'
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
    expect(playbook.dir)
      .to.be.a.directory()
      .and.be.empty()
  })

  it('should publish site to fs at destination path override when another destination is specified', async () => {
    const destDir = './output'
    playbook.output.destinations.push(Object.freeze({ provider: 'archive' }))
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDir
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    verifyFsOutput(destDir)
    await verifyArchiveOutput(DEFAULT_DEST_ARCHIVE)
    expect(playbook.output.destinations).to.have.lengthOf(1)
  })

  it('should publish site to destination override even when destinations is empty', async () => {
    const destDir = './output'
    Object.freeze(playbook.output.destinations)
    playbook.output.dir = destDir
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    verifyFsOutput(destDir)
    expect(playbook.output.destinations).to.be.empty()
  })

  it('should clean all destinations if clean is set on output', async () => {
    const destDir1 = './site1'
    const destDir2 = './site2'
    const cleanMeFile1 = ospath.resolve(playbook.dir, destDir1, 'clean-me.txt')
    const cleanMeFile2 = ospath.resolve(playbook.dir, destDir2, 'clean-me.txt')
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

  it('should clean destinations marked for cleaning', async () => {
    const destDir1 = './site1'
    const destDir2 = './site2'
    const leaveMeFile1 = ospath.resolve(playbook.dir, destDir1, 'leave-me.txt')
    const cleanMeFile2 = ospath.resolve(playbook.dir, destDir2, 'clean-me.txt')
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
    const destFile = './report.txt'
    const providerAbsPath = ospath.resolve(playbook.dir, 'reporter-abs.js')
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), providerAbsPath)
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: providerAbsPath, path: destFile })
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    expect(ospath.resolve(playbook.dir, destFile))
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should load custom provider from an absolute path outside working directory', async () => {
    const destFile = './report.txt'
    const providerAbsPath = ospath.join(TMP_DIR, `reporter-${process.pid}-${Date.now()}.js`)
    try {
      fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), providerAbsPath)
      playbook.site = { title: 'The Site' }
      playbook.output.destinations.push({ provider: providerAbsPath, path: destFile })
      await publishSite(playbook, catalogs)
      expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
      expect(ospath.resolve(playbook.dir, destFile))
        .to.be.a.file()
        .with.contents('published 6 files for The Site')
    } finally {
      fs.removeSync(providerAbsPath)
    }
  })

  it('should load custom provider from relative path resolved from playbook dir', async () => {
    const destFile = './report.txt'
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), ospath.resolve(playbook.dir, 'reporter-rel.js'))
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: './reporter-rel', path: destFile })
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    expect(ospath.resolve(playbook.dir, destFile))
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should load custom provider from relative path resolved from cwd when playbook dir not set', async () => {
    process.chdir(WORK_DIR)
    const destFile = './report.txt'
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), 'reporter-rel.js')
    delete playbook.dir
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: './reporter-rel.js', path: destFile })
    await publishSite(playbook, catalogs)
    expect(DEFAULT_DEST_FS).to.not.be.a.path()
    expect(destFile)
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should load custom provider from node modules path', async () => {
    const destFile = './report.txt'
    const providerAbsPath = ospath.resolve(playbook.dir, 'node_modules/reporter-mod/index.js')
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), providerAbsPath)
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: 'reporter-mod', path: destFile })
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    expect(ospath.resolve(playbook.dir, destFile))
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should load custom provider multiple times', async () => {
    const destFile = './report.txt'
    const destFile2 = './report.txt.1'
    fs.copySync(ospath.join(FIXTURES_DIR, 'reporter.js'), ospath.resolve(playbook.dir, 'reporter-multi.js'))
    playbook.site = { title: 'The Site' }
    playbook.output.destinations.push({ provider: './reporter-multi', path: destFile })
    playbook.output.destinations.push({ provider: './reporter-multi', path: destFile })
    await publishSite(playbook, catalogs)
    expect(ospath.resolve(playbook.dir, DEFAULT_DEST_FS)).to.not.be.a.path()
    expect(ospath.resolve(playbook.dir, destFile))
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
    expect(ospath.resolve(playbook.dir, destFile2))
      .to.be.a.file()
      .with.contents('published 6 files for The Site')
  })

  it('should throw error if destination provider is unsupported', async () => {
    playbook.output.destinations.push({ provider: 'unknown' })
    const publishSiteDeferred = await deferExceptions(publishSite, playbook, catalogs)
    expect(publishSiteDeferred).to.throw('Unsupported destination provider: unknown')
  })
})
