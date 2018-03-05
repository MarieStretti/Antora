/* eslint-env mocha */
'use strict'

const { deferExceptions, expect, removeSyncForce } = require('../../../test/test-utils')

const cheerio = require('cheerio')
const fs = require('fs-extra')
const generateSite = require('@antora/site-generator-default')
const ospath = require('path')
const RepositoryBuilder = require('../../../test/repository-builder')

const CONTENT_REPOS_DIR = ospath.join(__dirname, 'content-repos')
const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')
const WORK_DIR = ospath.join(__dirname, 'work')
const TIMEOUT = 5000
const UI_BUNDLE_URI =
  'https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/master/raw/build/ui-bundle.zip?job=bundle-stable'

describe('generateSite()', () => {
  let $
  let destAbsDir
  let destDir
  let env
  let playbookSpec
  let playbookFile
  let repositoryBuilder
  let uiBundleUri

  const readFile = (file, dir) => fs.readFileSync(dir ? ospath.join(dir, file) : file, 'utf8')

  const loadHtmlFile = (relative) => cheerio.load(readFile(relative, destAbsDir))

  before(async () => {
    destDir = '_site'
    destAbsDir = ospath.join(WORK_DIR, destDir)
    playbookFile = ospath.join(WORK_DIR, 'the-site.json')
    repositoryBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
    uiBundleUri = UI_BUNDLE_URI
  })

  beforeEach(async () => {
    env = { ANTORA_CACHE_DIR: ospath.join(WORK_DIR, '.antora/cache') }
    removeSyncForce(CONTENT_REPOS_DIR)
    await repositoryBuilder
      .init('the-component')
      .then(() => repositoryBuilder.checkoutBranch('v2.0'))
      .then(() =>
        repositoryBuilder.addComponentDescriptorToWorktree({
          name: 'the-component',
          version: '2.0',
          nav: ['modules/ROOT/nav.adoc'],
        })
      )
      .then(() => repositoryBuilder.importFilesFromFixture('the-component'))
      .then(() => repositoryBuilder.close('master'))
    playbookSpec = {
      site: { title: 'The Site' },
      content: {
        sources: [{ url: ospath.join(CONTENT_REPOS_DIR, 'the-component'), branches: 'v2.0' }],
      },
      ui: { bundle: uiBundleUri },
      output: {
        destinations: [{ provider: 'fs', path: '.' + ospath.sep + destDir }],
      },
    }
    fs.ensureDirSync(WORK_DIR)
    fs.removeSync(playbookFile)
    removeSyncForce(ospath.join(WORK_DIR, destDir.split('/')[0]))
  })

  after(() => {
    removeSyncForce(CONTENT_REPOS_DIR)
    if (process.env.KEEP_CACHE) {
      removeSyncForce(ospath.join(WORK_DIR, destDir.split('/')[0]))
      fs.removeSync(playbookFile)
    } else {
      removeSyncForce(WORK_DIR)
    }
  })

  it('should generate site into output directory specified in playbook file', async () => {
    playbookSpec.site.start_page = '2.0@the-component::index'
    playbookSpec.site.keys = { google_analytics: 'UA-XXXXXXXX-1' }
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, '_'))
      .to.be.a.directory()
      .with.subDirs.with.members(['css', 'js', 'font', 'img'])
    expect(ospath.join(destAbsDir, '_/css/site.css')).to.be.a.file()
    expect(ospath.join(destAbsDir, '_/js/site.js')).to.be.a.file()
    expect(ospath.join(destAbsDir, 'the-component'))
      .to.be.a.directory()
      .with.subDirs(['2.0'])
    expect(ospath.join(destAbsDir, 'index.html'))
      .to.be.a.file()
      .with.contents.that.match(/<meta http-equiv="refresh" content="0; url=the-component\/2.0\/index.html">/)
    expect(ospath.join(destAbsDir, 'the-component/2.0/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/index.html')
    expect($('head > title')).to.have.text('Index Page :: The Site')
    // assert relative UI path is correct
    expect($('head > link[rel=stylesheet]')).to.have.attr('href', '../../_/css/site.css')
    expect($('head > script:first-of-type')).to.have.attr(
      'src',
      'https://www.googletagmanager.com/gtag/js?id=UA-XXXXXXXX-1'
    )
    expect($('body > script:first-of-type')).to.have.attr('src', '../../_/js/site.js')
    expect($('nav.navbar .navbar-brand .navbar-item')).to.have.attr('href', '../..')
    // assert current component version is correct
    expect($('.navigation-explore .current .title')).to.have.text('The Component')
    expect($('.navigation-explore .component.is-current .title')).to.have.text('The Component')
    expect($('.navigation-explore .component.is-current .version')).to.have.lengthOf(1)
    expect($('.navigation-explore .component.is-current .version a')).to.have.text('2.0')
    expect($('.navigation-explore .component.is-current .version.is-current a')).to.have.text('2.0')
    expect($('.navigation-explore .component.is-current .version.is-latest a')).to.have.text('2.0')
    // assert paths in navigation are relativized
    expect($('nav.nav-menu .nav-link')).to.have.attr('href', 'index.html')
    expect($('article h1')).to.have.text('Index Page')
    expect($('article img')).to.have.attr('src', '_images/activity-diagram.svg')
    expect(ospath.join(destAbsDir, 'the-component/2.0/_images')).to.be.a.directory()
    expect(ospath.join(destAbsDir, 'the-component/2.0/_images/activity-diagram.svg')).to.be.a.file()
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/the-page.html')
    expect($('nav.nav-menu .is-current-page')).to.have.lengthOf(1)
    expect($('nav.nav-menu .is-current-page > a.nav-link')).to.have.attr('href', 'the-page.html')
    expect($('.page-versions')).to.not.exist()
  }).timeout(TIMEOUT)

  it('should resolve dot-relative paths in playbook relative to playbook dir', async () => {
    const repoUrl = '.' + ospath.sep + ospath.relative(WORK_DIR, playbookSpec.content.sources[0].url)
    playbookSpec.content.sources[0].url = repoUrl
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const altWorkDir = ospath.join(WORK_DIR, 'some-other-folder')
    fs.ensureDirSync(altWorkDir)
    const cwd = process.cwd()
    process.chdir(altWorkDir)
    await generateSite(['--playbook', ospath.relative('.', playbookFile)], env)
    process.chdir(cwd)
    expect(ospath.join(destAbsDir, '_'))
      .to.be.a.directory()
      .with.subDirs.with.members(['css', 'js', 'font', 'img'])
    expect(ospath.join(destAbsDir, 'the-component'))
      .to.be.a.directory()
      .with.subDirs(['2.0'])
  }).timeout(TIMEOUT)

  it('should generate site into output directory specified in arguments', async () => {
    const destDirOverride = ospath.join(destDir, 'beta')
    const destAbsDirOverride = ospath.join(WORK_DIR, destDirOverride)
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile, '--to-dir', '.' + ospath.sep + destDirOverride], env)
    expect(ospath.join(destAbsDirOverride, '_'))
      .to.be.a.directory()
      .with.subDirs.with.members(['css', 'js', 'font', 'img'])
    expect(ospath.join(destAbsDirOverride, 'the-component'))
      .to.be.a.directory()
      .with.subDirs(['2.0'])
  }).timeout(TIMEOUT)

  it('should use start page from latest version of component if version not specified', async () => {
    playbookSpec.site.start_page = 'the-component::index'
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'index.html'))
      .to.be.a.file()
      .with.contents.that.match(/<meta http-equiv="refresh" content="0; url=the-component\/2.0\/index.html">/)
  }).timeout(TIMEOUT)

  it('should throw error if start page cannot be resolved', async () => {
    playbookSpec.site.start_page = 'unknown-component::index'
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const generateSiteDeferred = await deferExceptions(generateSite, ['--playbook', playbookFile], env)
    expect(generateSiteDeferred).to.throw('Specified start page for site not found: unknown-component::index')
  }).timeout(TIMEOUT)

  it('should qualify applicable links using site url if set in playbook', async () => {
    playbookSpec.site.url = 'https://example.com/docs/'
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'sitemap.xml')).to.be.a.file()
    expect(ospath.join(destAbsDir, 'the-component/2.0/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/index.html')
    expect($('head link[rel=canonical]')).to.have.attr('href', 'https://example.com/docs/the-component/2.0/index.html')
    expect($('nav.navbar .navbar-brand .navbar-item')).to.have.attr('href', 'https://example.com/docs')
  }).timeout(TIMEOUT)

  it('should pass AsciiDoc attributes defined in playbook to AsciiDoc processor', async () => {
    playbookSpec.asciidoc = {
      attributes: { sectanchors: null, sectnums: '', description: 'Stuff about stuff@' },
    }
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/the-page.html')
    expect($('head meta[name=description]')).to.have.attr('content', 'Stuff about stuff')
    expect($('h2#_section_a')).to.have.html('1. Section A')
    expect($('h2#_section_b')).to.have.html('2. Section B')
    expect(ospath.join(destAbsDir, 'the-component/2.0/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/index.html')
    expect($('head meta[name=description]')).to.have.attr('content', 'The almighty index page')
  }).timeout(TIMEOUT)

  it('should register extensions defined in playbook on AsciiDoc processor', async () => {
    fs.outputFileSync(
      ospath.resolve(WORK_DIR, 'ext', 'shout-tree-processor.js'),
      fs.readFileSync(ospath.resolve(FIXTURES_DIR, 'shout-tree-processor.js'), 'utf8')
    )
    playbookSpec.asciidoc = {
      attributes: { volume: '3' },
      extensions: ['./ext/shout-tree-processor.js', ospath.resolve(FIXTURES_DIR, 'named-entity-postprocessor.js')],
    }
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page.html'))
      .to.be.a.file()
      .with.contents.that.match(/Section A content!!!/)
      .and.with.contents.that.match(/&#169;/)
    global.Opal.Asciidoctor.Extensions.unregisterAll()
  }).timeout(TIMEOUT)

  it('should add edit page link to toolbar if page.editUrl is set in UI model', async () => {
    await repositoryBuilder.open().then(() => repositoryBuilder.checkoutBranch('v2.0'))
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/the-page.html')
    const thePagePath = 'modules/ROOT/pages/the-page.adoc'
    const editUrl =
      ospath.sep === '\\'
        ? 'file:///' + ospath.join(repositoryBuilder.repoPath, thePagePath).replace(/\\/g, '/')
        : 'file://' + ospath.join(repositoryBuilder.repoPath, thePagePath)
    expect($('.toolbar .edit-this-page a')).to.have.attr('href', editUrl)
  }).timeout(TIMEOUT)

  it('should provide navigation to multiple versions of a component', async () => {
    await repositoryBuilder
      .open()
      .then(() => repositoryBuilder.checkoutBranch('v1.0'))
      .then(() =>
        repositoryBuilder.addComponentDescriptorToWorktree({
          name: 'the-component',
          version: '1.0',
          nav: ['modules/ROOT/nav.adoc'],
        })
      )
      .then(() =>
        repositoryBuilder.importFilesFromFixture('the-component', {
          exclude: ['modules/ROOT/pages/new-page.adoc'],
        })
      )
      .then(() => repositoryBuilder.close('master'))
    playbookSpec.content.sources[0].branches = ['v2.0', 'v1.0']
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-component'))
      .to.be.a.directory()
      .with.subDirs(['1.0', '2.0'])
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/the-page.html')
    // assert that all versions of page are shown
    expect($('.page-versions')).to.exist()
    expect($('.page-versions .versions-menu-toggle')).to.have.text('2.0')
    expect($('.page-versions a.version')).to.have.lengthOf(2)
    expect($('.page-versions a.version.is-current'))
      .to.have.lengthOf(1)
      .and.to.have.text('2.0')
      .and.to.have.attr('href', 'the-page.html')
    expect($('.page-versions a.version:not(.is-current)'))
      .to.have.lengthOf(1)
      .and.to.have.text('1.0')
      .and.to.have.attr('href', '../1.0/the-page.html')
    expect(ospath.join(destAbsDir, 'the-component/1.0/new-page.html')).to.not.be.a.path()
    expect(ospath.join(destAbsDir, 'the-component/2.0/new-page.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/new-page.html')
    expect($('.page-versions a.version')).to.have.lengthOf(2)
    expect($('.page-versions a.version:not(.is-current)'))
      .to.have.lengthOf(1)
      .and.to.have.class('is-missing')
      .and.to.have.text('1.0')
      .and.to.have.attr('href', '../1.0/index.html')
    // assert that all versions of component are present in navigation explore panel
    expect($('.navigation-explore .component.is-current li.version')).to.have.lengthOf(2)
    expect(
      $('.navigation-explore .component.is-current li.version')
        .eq(0)
        .find('a')
    )
      .to.have.text('2.0')
      .and.to.have.attr('href', 'index.html')
    expect(
      $('.navigation-explore .component.is-current li.version')
        .eq(1)
        .find('a')
    )
      .to.have.text('1.0')
      .and.to.have.attr('href', '../1.0/index.html')
    expect(ospath.join(destAbsDir, 'the-component/1.0/the-page.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/1.0/the-page.html')
    expect($('.navigation-explore .component.is-current .version')).to.have.lengthOf(2)
    expect($('.navigation-explore .component.is-current .version.is-latest a')).to.have.text('2.0')
    expect($('.navigation-explore .component.is-current .version.is-current a')).to.have.text('1.0')
  }).timeout(TIMEOUT)

  it('should provide navigation to all versions of all components', async () => {
    await repositoryBuilder
      .open()
      .then(() => repositoryBuilder.checkoutBranch('v1.0'))
      .then(() =>
        repositoryBuilder.addComponentDescriptorToWorktree({
          name: 'the-component',
          version: '1.0',
          nav: ['modules/ROOT/nav.adoc'],
        })
      )
      .then(() =>
        repositoryBuilder.importFilesFromFixture('the-component', {
          exclude: ['modules/ROOT/pages/new-page.adoc'],
        })
      )
      .then(() => repositoryBuilder.close('master'))

    await repositoryBuilder
      .init('the-other-component')
      .then(() =>
        repositoryBuilder.addComponentDescriptorToWorktree({
          name: 'the-other-component',
          version: 'master',
          start_page: 'core:index.adoc',
          nav: ['modules/core/nav.adoc'],
        })
      )
      .then(() => repositoryBuilder.importFilesFromFixture('the-other-component'))
      .then(() => repositoryBuilder.checkoutBranch('v1.0'))
      .then(() =>
        repositoryBuilder.addComponentDescriptorToWorktree({
          name: 'the-other-component',
          version: '1.0',
          start_page: 'core:index.adoc',
          nav: ['modules/core/nav.adoc'],
        })
      )
      .then(() => repositoryBuilder.close('master'))

    playbookSpec.content.sources[0].branches = ['v2.0', 'v1.0']
    playbookSpec.content.sources.push({
      url: ospath.join(CONTENT_REPOS_DIR, 'the-other-component'),
      branches: ['master', 'v1.0'],
    })
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-other-component')).to.be.a.directory()
    expect(ospath.join(destAbsDir, 'the-other-component/core/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-other-component/core/index.html')
    expect($('.navigation-explore .component')).to.have.lengthOf(2)
    // assert sorted by title
    expect(
      $('.navigation-explore .component')
        .eq(0)
        .find('.title')
    ).to.have.text('The Component')
    expect(
      $('.navigation-explore .component')
        .eq(1)
        .find('.title')
    ).to.have.text('The Other Component')
    // assert correct component is marked as current
    expect($('.navigation-explore .component').eq(1)).to.have.class('is-current')
    expect($('.navigation-explore .component.is-current a')).to.have.lengthOf(2)
    expect($('.navigation-explore .component.is-current a').eq(0)).to.have.text('master')
    expect($('.navigation-explore .component.is-current .version').eq(0))
      .to.have.class('is-current')
      .and.to.have.class('is-latest')
    expect(ospath.join(destAbsDir, 'the-component/2.0/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/index.html')
    // assert component link points to start page
    expect($('.navigation-explore .component:not(.is-current) a').eq(0)).to.have.attr(
      'href',
      '../../the-other-component/core/index.html'
    )
  }).timeout(TIMEOUT)

  it('should generate static redirect files for aliases by default', async () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-alias.html')).to.be.a.file()
    const contents = readFile('the-component/2.0/the-alias.html', destAbsDir)
    expect(contents).to.include(`<script>location="the-page.html"</script>`)
  }).timeout(TIMEOUT)

  it('should generate nginx rewrite config file for aliases when using nginx redirect facility', async () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile, '--redirect-facility', 'nginx'], env)
    expect(ospath.join(destAbsDir, '.etc/nginx/rewrite.conf')).to.be.a.file()
    const contents = readFile('.etc/nginx/rewrite.conf', destAbsDir)
    const rules = `location = /the-component/2.0/the-alias.html { return 301 /the-component/2.0/the-page.html; }`
    expect(contents).to.include(rules)
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-alias.html')).to.not.be.a.path()
  }).timeout(TIMEOUT)

  it('should indexify URLs to internal pages', async () => {
    playbookSpec.urls = { html_extension_style: 'indexify' }
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    await generateSite(['--playbook', playbookFile], env)
    expect(ospath.join(destAbsDir, 'the-component/2.0/index.html')).to.be.a.file()
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/index.html')
    expect($('article a.page')).to.have.attr('href', 'the-page/')
    expect($('nav.crumbs a')).to.have.attr('href', './')
    expect($('nav.nav-menu .nav-link')).to.have.attr('href', './')
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-page/index.html')).to.be.a.file()
    $ = loadHtmlFile('the-component/2.0/the-page/index.html')
    expect($('nav.nav-menu .nav-link')).to.have.attr('href', '../')
    expect($('head > link[rel=stylesheet]')).to.have.attr('href', '../../../_/css/site.css')
    expect(ospath.join(destAbsDir, 'the-component/2.0/the-alias/index.html')).to.be.a.file()
    const contents = readFile('the-component/2.0/the-alias/index.html', destAbsDir)
    expect(contents).to.include(`<script>location="../the-page/"</script>`)
  }).timeout(TIMEOUT)

  // to test:
  // - don't pass environment variable map to generateSite
  // - pass environment varaible override to generateSite
  // - test if component start page is missing (current throws an error because its undefined)
  // - path to images from topic dir
  // - html URL extension style
})
