/* eslint-env mocha */
'use strict'

const { captureStdErrSync, expect, spy } = require('../../../test/test-utils')

const classifyContent = require('@antora/content-classifier')
const ContentCatalog = require('@antora/content-classifier/lib/content-catalog')
const File = require('@antora/content-classifier/lib/file')
const mimeTypes = require('@antora/content-aggregator/lib/mime-types-with-asciidoc')
const { posix: path } = require('path')

const { START_PAGE_ID } = require('@antora/content-classifier/lib/constants')

// TODO change these to pure unit tests that don't rely on the classifyContent function
describe('ContentCatalog', () => {
  let playbook
  let aggregate

  const createFile = (path_) => {
    const basename = path.basename(path_)
    const extname = path.extname(path_)
    const stem = path.basename(path_, extname)
    return {
      path: path_,
      src: { basename, mediaType: mimeTypes.lookup(extname), stem, extname },
    }
  }

  beforeEach(() => {
    playbook = {
      site: {},
      urls: { htmlExtensionStyle: 'default' },
    }
  })

  describe('#getComponentMap()', () => {
    it('should return components as a map ordered by insertion order', () => {
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('foo', '1.0', { title: 'Foo' })
      contentCatalog.registerComponentVersion('bar', '1.0', { title: 'Bar' })
      contentCatalog.registerComponentVersion('yin', '1.0', { title: 'Yin' })
      contentCatalog.registerComponentVersion('yang', '1.0', { title: 'Yang' })
      const componentMap = contentCatalog.getComponentMap()
      expect(componentMap).not.to.be.instanceOf(Map)
      expect(Object.keys(componentMap)).to.eql(['foo', 'bar', 'yin', 'yang'])
      expect(Object.values(componentMap).map((v) => v.title)).to.eql(['Foo', 'Bar', 'Yin', 'Yang'])
    })
  })

  describe('#getComponentsSortedBy()', () => {
    it('should return components sorted by title', () => {
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('foo', '1.0', { title: 'Foo' })
      contentCatalog.registerComponentVersion('bar', '1.0', { title: 'Bar' })
      contentCatalog.registerComponentVersion('yin', '1.0', { title: 'Yin' })
      contentCatalog.registerComponentVersion('yang', '1.0', { title: 'Yang' })
      const components = contentCatalog.getComponentsSortedBy('title')
      expect(components.map((v) => v.title)).to.eql(['Bar', 'Foo', 'Yang', 'Yin'])
    })
  })

  describe('#getComponentMapSortedBy()', () => {
    it('should return components as map sorted by title', () => {
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('foo', '1.0', { title: 'Foo' })
      contentCatalog.registerComponentVersion('bar', '1.0', { title: 'Bar' })
      contentCatalog.registerComponentVersion('yin', '1.0', { title: 'Yin' })
      contentCatalog.registerComponentVersion('yang', '1.0', { title: 'Yang' })
      const componentMap = contentCatalog.getComponentMapSortedBy('title')
      expect(Object.keys(componentMap)).to.eql(['bar', 'foo', 'yang', 'yin'])
      expect(Object.values(componentMap).map((v) => v.title)).to.eql(['Bar', 'Foo', 'Yang', 'Yin'])
    })
  })

  describe('#registerComponentVersion()', () => {
    it('should add new component to catalog if component is not present', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
      const url = '/the-component/1.0.0/index.html'
      const contentCatalog = new ContentCatalog()
      const descriptor = { title }
      expect(contentCatalog.getComponents()).to.have.lengthOf(0)
      contentCatalog.addFile({
        src: {
          component: name,
          version,
          module: 'ROOT',
          family: 'page',
          relative: 'index.adoc',
          stem: 'index',
          mediaType: 'text/asciidoc',
        },
      })
      contentCatalog.registerComponentVersion(name, version, descriptor)
      const components = contentCatalog.getComponents()
      expect(components).to.have.lengthOf(1)
      expect(components[0]).to.deep.include({
        name,
        title,
        url,
        versions: [{ version, displayVersion: version, title, url }],
      })
      expect(components[0].latest).to.eql({ version, displayVersion: version, title, url })
      // NOTE verify latestVersion alias
      expect(components[0].latestVersion).to.equal(components[0].latest)
    })

    it('should add new version to existing component if component is already present', () => {
      const name = 'the-component'
      const version1 = '1.0.0'
      const title1 = 'The Component (1.0.0)'
      const descriptor1 = { title: title1 }
      const url1 = '/the-component/1.0.0/index.html'
      const version2 = '2.0.0'
      const title2 = 'The Component (2.0.0)'
      const descriptor2 = { title: title2 }
      const url2 = '/the-component/2.0.0/index.html'
      const indexPageT = { family: 'page', relative: 'index.adoc', stem: 'index', mediaType: 'text/asciidoc' }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile({ src: Object.assign({ component: name, version: version1, module: 'ROOT' }, indexPageT) })
      contentCatalog.registerComponentVersion(name, version1, descriptor1)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      const component = contentCatalog.getComponent(name)

      contentCatalog.addFile({ src: Object.assign({ component: name, version: version2, module: 'ROOT' }, indexPageT) })
      contentCatalog.registerComponentVersion(name, version2, descriptor2)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      expect(contentCatalog.getComponent(name)).to.equal(component)
      expect(component).to.deep.include({
        name,
        title: title2,
        url: url2,
        versions: [
          { version: version2, displayVersion: version2, title: title2, url: url2 },
          { version: version1, displayVersion: version1, title: title1, url: url1 },
        ],
      })
      expect(component.latest).to.eql({
        version: version2,
        displayVersion: version2,
        title: title2,
        url: url2,
      })
    })

    it('should throw error if component version already exists', () => {
      const contentCatalog = new ContentCatalog()
      expect(() => {
        contentCatalog.registerComponentVersion('the-component', '1.0.0')
        contentCatalog.registerComponentVersion('the-component', '1.0.0')
      }).to.throw('Duplicate version detected for component')
    })

    it('should add component version that has same comparison value as existing version', () => {
      const contentCatalog = new ContentCatalog()
      expect(() => {
        contentCatalog.registerComponentVersion('the-component', 'r.y')
        contentCatalog.registerComponentVersion('the-component', 'r.x')
      }).not.to.throw()
      const component = contentCatalog.getComponent('the-component')
      const versions = component.versions
      expect(versions).to.have.lengthOf(2)
      expect(versions[0].version).to.equal('r.y')
      expect(versions[1].version).to.equal('r.x')
    })

    it('should not use prerelease as a latest version', () => {
      const srcTemplate = { family: 'page', relative: 'index.adoc', stem: 'index', mediaType: 'text/asciidoc' }
      const componentName = 'the-component'
      const version1 = '1.0.0'
      const title1 = 'The Component (1.0.0)'
      const url1 = '/the-component/1.0.0/index.html'
      const descriptor1 = { title: title1 }
      const src1 = Object.assign({}, srcTemplate, { component: componentName, version: version1, module: 'ROOT' })
      const version2 = '2.0.0'
      const title2 = 'The Component (2.0.0)'
      const url2 = '/the-component/2.0.0/index.html'
      const prerelease2 = true
      const descriptor2 = { title: title2, prerelease: prerelease2 }
      const src2 = Object.assign({}, srcTemplate, { component: componentName, version: version2, module: 'ROOT' })
      const contentCatalog = new ContentCatalog()

      contentCatalog.addFile({ src: src1 })
      contentCatalog.registerComponentVersion(componentName, version1, descriptor1)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      const component = contentCatalog.getComponent(componentName)

      contentCatalog.addFile({ src: src2 })
      contentCatalog.registerComponentVersion(componentName, version2, descriptor2)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      expect(contentCatalog.getComponent(componentName)).to.equal(component)

      expect(component.versions).to.eql([
        {
          version: version2,
          displayVersion: version2,
          title: title2,
          url: url2,
          prerelease: prerelease2,
        },
        {
          version: version1,
          displayVersion: version1,
          title: title1,
          url: url1,
        },
      ])
      expect(component.latest).to.eql({
        version: version1,
        displayVersion: version1,
        title: title1,
        url: url1,
      })
      expect(component.name).to.equal(componentName)
      expect(component.title).to.equal(title1)
      expect(component.url).to.equal(url1)
    })

    it('should point latest to newest version if all versions are prereleases', () => {
      const srcTemplate = { family: 'page', relative: 'index.adoc', stem: 'index', mediaType: 'text/asciidoc' }
      const componentName = 'the-component'
      const version1 = '1.0.0'
      const title1 = 'The Component (1.0.0)'
      const url1 = '/the-component/1.0.0/index.html'
      const prerelease1 = true
      const descriptor1 = { title: title1, prerelease: prerelease1 }
      const src1 = Object.assign({}, srcTemplate, { component: componentName, version: version1, module: 'ROOT' })
      const version2 = '2.0.0'
      const title2 = 'The Component (2.0.0)'
      const url2 = '/the-component/2.0.0/index.html'
      const prerelease2 = true
      const descriptor2 = { title: title2, prerelease: prerelease2 }
      const src2 = Object.assign({}, srcTemplate, { component: componentName, version: version2, module: 'ROOT' })
      const contentCatalog = new ContentCatalog()

      contentCatalog.addFile({ src: src1 })
      contentCatalog.registerComponentVersion(componentName, version1, descriptor1)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      const component = contentCatalog.getComponent(componentName)

      contentCatalog.addFile({ src: src2 })
      contentCatalog.registerComponentVersion(componentName, version2, descriptor2)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      expect(contentCatalog.getComponent(componentName)).to.equal(component)

      expect(component.versions).to.eql([
        {
          version: version2,
          displayVersion: version2,
          title: title2,
          url: url2,
          prerelease: prerelease2,
        },
        {
          version: version1,
          displayVersion: version1,
          title: title1,
          url: url1,
          prerelease: prerelease1,
        },
      ])
      expect(component.latest).to.eql({
        version: version2,
        displayVersion: version2,
        title: title2,
        url: url2,
        prerelease: prerelease2,
      })
      expect(component.name).to.equal(componentName)
      expect(component.title).to.equal(title2)
      expect(component.url).to.equal(url2)
    })

    it('should set displayVersion property to specified value', () => {
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('the-component', '1.0', { title: 'ACME', displayVersion: '1.0 Beta' })
      const component = contentCatalog.getComponent('the-component')
      expect(component).to.exist()
      expect(component.versions[0]).to.exist()
      expect(component.versions[0].displayVersion).to.equal('1.0 Beta')
    })

    it('should set displayVersion property automatically if prerelease is a string literal', () => {
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('the-component', '1.0', { title: 'ACME', prerelease: 'Beta' })
      const component = contentCatalog.getComponent('the-component')
      expect(component).to.exist()
      expect(component.versions[0]).to.exist()
      expect(component.versions[0].prerelease).to.equal('Beta')
      expect(component.versions[0].displayVersion).to.equal('1.0 Beta')
    })

    it('should set displayVersion property automatically if prerelease is a string object', () => {
      const contentCatalog = new ContentCatalog()
      const prerelease = new String('Beta') // eslint-disable-line no-new-wrappers
      contentCatalog.registerComponentVersion('the-component', '1.0', { title: 'ACME', prerelease })
      const component = contentCatalog.getComponent('the-component')
      expect(component).to.exist()
      expect(component.versions[0]).to.exist()
      expect(component.versions[0].prerelease.toString()).to.equal('Beta')
      expect(component.versions[0].displayVersion).to.equal('1.0 Beta')
    })

    it('should not offset prerelease label by space in displayVersion property if begins with dot or hyphen', () => {
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('the-component', '1.0', { title: 'ACME', prerelease: '-dev' })
      contentCatalog.registerComponentVersion('the-other-component', '1.0', { title: 'XYZ', prerelease: '.beta.1' })
      let component
      component = contentCatalog.getComponent('the-component')
      expect(component).to.exist()
      expect(component.versions[0]).to.exist()
      expect(component.versions[0].prerelease).to.equal('-dev')
      expect(component.versions[0].displayVersion).to.equal('1.0-dev')
      component = contentCatalog.getComponent('the-other-component')
      expect(component).to.exist()
      expect(component.versions[0]).to.exist()
      expect(component.versions[0].prerelease).to.equal('.beta.1')
      expect(component.versions[0].displayVersion).to.equal('1.0.beta.1')
    })

    it('should use url from specified start page', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
      const descriptor = { title, startPage: 'home.adoc' }
      const url = '/the-component/1.0.0/home.html'
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile({
        src: {
          component: name,
          version,
          module: 'ROOT',
          family: 'page',
          relative: 'home.adoc',
          stem: 'home',
          mediaType: 'text/asciidoc',
        },
      })
      contentCatalog.registerComponentVersion(name, version, descriptor)
      const components = contentCatalog.getComponents()
      expect(components).to.have.lengthOf(1)
      expect(components[0]).to.deep.include({
        name,
        title,
        url,
        versions: [{ version, displayVersion: version, title, url }],
      })
      expect(components[0].latest).to.eql({ version, displayVersion: version, title, url })
    })

    it('should throw error if specified start page not found', () => {
      const stdErrMessages = captureStdErrSync(() =>
        new ContentCatalog().registerComponentVersion('the-component', '1.0.0', {
          title: 'The Component',
          startPage: 'home.adoc',
        })
      )
      expect(stdErrMessages).to.have.lengthOf(1)
      expect(stdErrMessages[0].trim()).to.equal('Start page specified for 1.0.0@the-component not found: home.adoc')
    })

    it('should use url of index page in ROOT module if found', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
      const url = '/the-component/1.0.0/index.html'
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile({
        src: {
          component: name,
          version,
          module: 'ROOT',
          family: 'page',
          relative: 'home.adoc',
          stem: 'home',
          mediaType: 'text/asciidoc',
        },
      })
      contentCatalog.addFile({
        src: {
          component: name,
          version,
          module: 'ROOT',
          family: 'page',
          relative: 'index.adoc',
          stem: 'index',
          mediaType: 'text/asciidoc',
        },
      })
      contentCatalog.registerComponentVersion(name, version, { title })
      const component = contentCatalog.getComponent(name)
      expect(component.url).to.equal(url)
    })

    it('should use url of synthetic index page in ROOT module if page not found', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
      const url = '/the-component/1.0.0/index.html'
      const contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion(name, version, { title })
      const component = contentCatalog.getComponent(name)
      expect(component.url).to.equal(url)
    })

    it('should store scoped AsciiDoc config on component version', () => {
      const contentCatalog = new ContentCatalog()
      const asciidocConfig = { attributes: { foo: 'bar' } }
      const descriptor = {
        title: 'ACME',
        displayVersion: '1.0 Beta',
        asciidocConfig,
      }
      contentCatalog.registerComponentVersion('the-component', '1.0', descriptor)
      const component = contentCatalog.getComponent('the-component')
      expect(component).to.exist()
      expect(component.versions[0]).to.exist()
      expect(component.versions[0].asciidocConfig).to.eql(asciidocConfig)
      //expect(descriptor).not.to.have.property('asciidocConfig')
      //expect(component.versions[0].descriptor).not.to.have.property('asciidocConfig')
    })
  })

  describe('#getComponentVersion()', () => {
    let contentCatalog

    beforeEach(() => {
      contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('the-component', '1.0.0', { title: 'The Component' })
      contentCatalog.registerComponentVersion('the-component', '2.0.0', { title: 'The Component' })
      contentCatalog.registerComponentVersion('the-other-component', '1.0.0', { title: 'The Other Component' })
    })

    it('should return the component version by component name and version', () => {
      const componentVersion = contentCatalog.getComponentVersion('the-component', '1.0.0')
      expect(componentVersion).to.exist()
      expect(componentVersion).to.include({ version: '1.0.0', title: 'The Component' })
    })

    it('should return the component version by component and version', () => {
      const component = contentCatalog.getComponent('the-component')
      const componentVersion = contentCatalog.getComponentVersion(component, '1.0.0')
      expect(componentVersion).to.exist()
      expect(componentVersion).to.include({ version: '1.0.0', title: 'The Component' })
    })

    it('should return undefined if the component name is not registered', () => {
      const componentVersion = contentCatalog.getComponentVersion('no-such-component', '1.0.0')
      expect(componentVersion).to.not.exist()
    })

    it('should return undefined if the version does not exist', () => {
      const componentVersion = contentCatalog.getComponentVersion('the-component', '3.0.0')
      expect(componentVersion).to.not.exist()
    })
  })

  describe('#getAll()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v4.5.6',
          files: [
            createFile('modules/ROOT/assets/images/directory-structure.svg'),
            createFile('modules/ROOT/pages/page-one.adoc'),
            createFile('modules/ROOT/pages/page-two.adoc'),
            createFile('modules/ROOT/partials/foo.adoc'),
          ],
        },
        {
          name: 'the-other-component',
          title: 'The Other Title',
          version: 'v4.5.6',
          files: [createFile('modules/ROOT/pages/page-three.adoc')],
        },
      ]
    })

    it('should return all files in catalog', () => {
      const contentCatalog = classifyContent(playbook, aggregate)
      const files = contentCatalog.getAll()
      expect(files).to.have.lengthOf(5)
      const pages = files.filter((it) => it.src.family === 'page')
      expect(pages).to.have.lengthOf(3)
      const partials = files.filter((it) => it.src.family === 'partial')
      expect(partials).to.have.lengthOf(1)
    })

    it('should map getFiles as alias', () => {
      const contentCatalog = classifyContent(playbook, aggregate)
      const files = contentCatalog.getFiles()
      expect(files).to.have.lengthOf(5)
      const pages = files.filter((it) => it.src.family === 'page')
      expect(pages).to.have.lengthOf(3)
      const partials = files.filter((it) => it.src.family === 'partial')
      expect(partials).to.have.lengthOf(1)
    })
  })

  describe('#findBy()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v4.5.6',
          files: [
            createFile('modules/ROOT/assets/images/launch-page.png'),
            createFile('modules/ROOT/pages/_partials/foo.adoc'),
            createFile('modules/ROOT/pages/page-one.adoc'),
            createFile('modules/ROOT/pages/page-two.adoc'),
            createFile('modules/ROOT/assets/images/directory-structure.svg'),
          ],
        },
        {
          name: 'the-other-component',
          title: 'The Other Title',
          version: 'v4.5.6',
          files: [
            createFile('modules/ROOT/pages/_partials/bar.adoc'),
            createFile('modules/ROOT/pages/page-three.adoc'),
          ],
        },
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/pages/page-one.adoc'), createFile('modules/ROOT/assets/images/foo.png')],
        },
      ]
    })

    it('should find files by family', () => {
      const contentCatalog = classifyContent(playbook, aggregate)
      const numPages = contentCatalog.getPages().length
      const pages = contentCatalog.findBy({ family: 'page' })
      expect(pages).to.have.lengthOf(numPages)
      pages.sort((a, b) => a.src.version.localeCompare(b.src.version) || a.path.localeCompare(b.path))
      expect(pages[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src.version).to.equal('v4.5.6')
      expect(pages[2].path).to.equal('modules/ROOT/pages/page-three.adoc')
      expect(pages[3].path).to.equal('modules/ROOT/pages/page-two.adoc')
    })

    it('should find files by component', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ component: 'the-component' })
      expect(pages).to.have.lengthOf(7)
      pages.sort((a, b) => a.src.version.localeCompare(b.src.version) || a.path.localeCompare(b.path))
      expect(pages[0].path).to.equal('modules/ROOT/assets/images/foo.png')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src.version).to.equal('v1.2.3')
      expect(pages[2].path).to.equal('modules/ROOT/assets/images/directory-structure.svg')
      expect(pages[2].src.version).to.equal('v4.5.6')
      expect(pages[3].path).to.equal('modules/ROOT/assets/images/launch-page.png')
      expect(pages[3].src.version).to.equal('v4.5.6')
      expect(pages[4].path).to.equal('modules/ROOT/pages/_partials/foo.adoc')
      expect(pages[4].src.version).to.equal('v4.5.6')
      expect(pages[5].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[5].src.version).to.equal('v4.5.6')
      expect(pages[6].path).to.equal('modules/ROOT/pages/page-two.adoc')
      expect(pages[6].src.version).to.equal('v4.5.6')
    })

    it('should find files by relative path', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ relative: 'page-one.adoc' })
      expect(pages).to.have.lengthOf(2)
      pages.sort((a, b) => a.src.version.localeCompare(b.src.version))
      expect(pages[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src.version).to.equal('v4.5.6')
    })

    it('should find files by extname', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ extname: '.svg' })
      expect(pages).to.have.lengthOf(1)
      const page = pages[0]
      expect(page.path).to.equal('modules/ROOT/assets/images/directory-structure.svg')
      expect(page.src.version).to.equal('v4.5.6')
    })

    it('should find all versions of a page', () => {
      const pages = classifyContent(playbook, aggregate).findBy({
        component: 'the-component',
        module: 'ROOT',
        family: 'page',
        relative: 'page-one.adoc',
      })
      expect(pages).to.have.lengthOf(2)
      pages.sort((a, b) => a.src.version.localeCompare(b.src.version))
      expect(pages[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[0].src).to.include({ component: 'the-component', version: 'v1.2.3' })
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src).to.include({ component: 'the-component', version: 'v4.5.6' })
    })
  })

  describe('#addFile()', () => {
    it('should populate out and pub when called with vinyl file that has src property', () => {
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile(new File({ src }))
      const result = contentCatalog.getById(src)
      expect(result).to.have.property('out')
      expect(result.out).to.include({ path: 'the-component/1.2.3/the-page.html', rootPath: '../..' })
      expect(result).to.have.property('pub')
      expect(result.pub).to.include({ url: '/the-component/1.2.3/the-page.html' })
    })

    it('should not populate out and pub when filename begins with an underscore', () => {
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: '_attributes.adoc',
        basename: '_attributes.adoc',
        stem: '_attributes',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile(new File({ src }))
      const result = contentCatalog.getById(src)
      expect(result).to.not.have.property('out')
      expect(result).to.not.have.property('pub')
    })

    it('should not populate out and pub when file is in directory that begins with an underscore', () => {
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: '_attributes/common.adoc',
        basename: '_attributes/common.adoc',
        stem: '_attributes/common',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile(new File({ src }))
      const result = contentCatalog.getById(src)
      expect(result).to.not.have.property('out')
      expect(result).to.not.have.property('pub')
    })

    it('should respect htmlUrlExtensionStyle setting when computing pub', () => {
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.htmlUrlExtensionStyle = 'indexify'
      contentCatalog.addFile(new File({ src }))
      const result = contentCatalog.getById(src)
      expect(result).to.have.property('out')
      expect(result.out).to.include({ path: 'the-component/1.2.3/the-page/index.html', rootPath: '../../..' })
      expect(result).to.have.property('pub')
      expect(result.pub).to.include({ url: '/the-component/1.2.3/the-page/' })
    })

    it('should not set out and pub properties if defined on input', () => {
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      const out = {}
      const pub = {}
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile(new File({ src, out, pub }))
      const result = contentCatalog.getById(src)
      expect(result).to.have.property('out')
      expect(result.out).to.equal(out)
      expect(result).to.have.property('pub')
      expect(result.pub).to.equal(pub)
    })

    it('should only set pub property on file in navigation family', () => {
      const src = {
        component: 'the-component',
        version: 'master',
        module: 'ROOT',
        family: 'nav',
        relative: 'nav.adoc',
        basename: 'nav.adoc',
        stem: 'nav',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile(new File({ src }))
      const result = contentCatalog.getById(src)
      expect(result).to.not.have.property('out')
      expect(result).to.have.property('pub')
      expect(result.pub.url).to.equal('/the-component/')
    })

    it('should set pub property on file in navigation family even if filename begins with underscore', () => {
      const src = {
        component: 'the-component',
        version: 'master',
        module: 'ROOT',
        family: 'nav',
        relative: 'pages/_nav.adoc',
        basename: '_nav.adoc',
        stem: 'pages/_nav',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile(new File({ src }))
      const result = contentCatalog.getById(src)
      expect(result).to.not.have.property('out')
      expect(result).to.have.property('pub')
      expect(result.pub.url).to.equal('/the-component/')
    })

    it('should convert object to vinyl file', () => {
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile({ path: src.relative, src })
      const result = contentCatalog.getById(src)
      expect(File.isVinyl(result)).to.be.true()
      expect(result.relative).to.equal('the-page.adoc')
      expect(result).to.have.property('out')
      expect(result).to.have.property('pub')
    })

    it('should process file using family from rel property if set', () => {
      const contentCatalog = new ContentCatalog()
      const relSrc = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-other-page.adoc',
        basename: 'the-other-page.adoc',
        stem: 'the-other-page',
        mediaType: 'text/asciidoc',
      }
      contentCatalog.addFile(new File({ src: relSrc }))
      const rel = contentCatalog.getById(relSrc)
      const src = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'alias',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      contentCatalog.addFile(new File({ src, rel }))
      const result = contentCatalog.getById(src)
      expect(result).to.have.property('out')
      expect(result.out).to.include({ path: 'the-component/1.2.3/the-page.html', rootPath: '../..' })
      expect(result).to.have.property('pub')
      expect(result.pub).to.include({ url: '/the-component/1.2.3/the-page.html' })
      expect(result).to.have.property('rel')
      expect(result.rel).to.have.property('pub')
      expect(result.rel.pub).to.include({ url: '/the-component/1.2.3/the-other-page.html' })
    })
  })

  describe('#registerPageAlias()', () => {
    let contentCatalog
    let targetPageSrc

    beforeEach(() => {
      contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('the-component', '1.2.3', { title: 'The Component' })
      targetPageSrc = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
    })

    // QUESTION should this case throw an error or warning?
    it('should not register alias if page spec is invalid', () => {
      expect(contentCatalog.registerPageAlias('the-component::', {})).to.be.undefined()
    })

    it('should register an alias for target file given a valid qualified page spec', () => {
      contentCatalog.registerComponentVersion('the-component', '1.0.0', { title: 'The Component' })
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('1.0.0@the-component::the-topic/alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.0.0',
        module: 'ROOT',
        family: 'alias',
        relative: 'the-topic/alias.adoc',
      })
      expect(result.path).to.equal(targetPage.path)
      expect(result).to.have.property('rel')
      expect(result.rel).to.equal(targetPage)
      expect(contentCatalog.getById(result.src)).to.equal(result)
    })

    it('should register an alias for target file given a valid contextual page spec', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
      expect(result.path).to.equal(targetPage.path)
      expect(result).to.have.property('rel')
      expect(result.rel).to.equal(targetPage)
      expect(contentCatalog.getById(result.src)).to.equal(result)
    })

    it('should set version of alias to latest version of component if version not specified', () => {
      contentCatalog.registerComponentVersion('other-component', '1.0', { title: 'Other Component' })
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('other-component::alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'other-component',
        version: '1.0',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
    })

    it('should register alias if component does not exist', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('1.0@unknown-component::alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'unknown-component',
        version: '1.0',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
    })

    it('should register alias if version does not exist', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('1.0@alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.0',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
    })

    it('should register alias if component does not exist and version is not specified', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('unknown-component::alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'unknown-component',
        version: 'master',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
    })

    it('should not allow alias to be registered that matches target page', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const expectedError = 'Page alias cannot reference itself: 1.2.3@the-component:ROOT:the-page.adoc'
      expect(() => contentCatalog.registerPageAlias(targetPageSrc.relative, targetPage)).to.throw(expectedError)
    })

    it('should not allow self reference to be used in page alias', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const expectedError = 'Page alias cannot reference itself: 1.2.3@the-component:ROOT:the-page.adoc'
      expect(() => contentCatalog.registerPageAlias('./' + targetPageSrc.relative, targetPage)).to.throw(expectedError)
    })

    it('should not allow parent reference to be used in page alias', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const expectedError = 'Page alias cannot reference itself: 1.2.3@the-component:ROOT:the-page.adoc'
      expect(() => contentCatalog.registerPageAlias('../' + targetPageSrc.relative, targetPage)).to.throw(expectedError)
    })

    it('should not allow alias to be registered that matches existing page', () => {
      const otherPageSrc = Object.assign({}, targetPageSrc)
      otherPageSrc.relative = otherPageSrc.basename = 'the-other-page.adoc'
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      contentCatalog.addFile(new File({ src: otherPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const expectedError = 'Page alias cannot reference an existing page: 1.2.3@the-component:ROOT:the-other-page.adoc'
      expect(() => contentCatalog.registerPageAlias(otherPageSrc.relative, targetPage)).to.throw(expectedError)
    })

    it('should not allow alias to be registered multiple times', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const expectedError = 'Duplicate alias: 1.2.3@the-component:ROOT:alias.adoc'
      expect(() => contentCatalog.registerPageAlias('alias.adoc', targetPage)).to.not.throw()
      expect(() => contentCatalog.registerPageAlias('alias.adoc', targetPage)).to.throw(expectedError)
    })

    it('should register an alias correctly when the HTML URL extension style is indexify', () => {
      contentCatalog = new ContentCatalog({ urls: { htmlExtensionStyle: 'indexify' } })
      contentCatalog.registerComponentVersion('the-component', '1.2.3', { title: 'The Component' })
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
      expect(result.out.path).to.equal('the-component/1.2.3/alias/index.html')
      expect(result.pub.url).to.equal('/the-component/1.2.3/alias/')
    })

    it('should register an alias correctly when the HTML URL extension style is drop', () => {
      contentCatalog = new ContentCatalog({ urls: { htmlExtensionStyle: 'drop' } })
      contentCatalog.registerComponentVersion('the-component', '1.2.3', { title: 'The Component' })
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('alias.adoc', targetPage)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
      expect(result.out.path).to.equal('the-component/1.2.3/alias.html')
      expect(result.pub.url).to.equal('/the-component/1.2.3/alias')
    })
  })

  describe('#resolvePage()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/assets/images/foo.png'), createFile('modules/ROOT/pages/page-one.adoc')],
        },
      ]
    })

    it('should find file by qualified page spec', () => {
      const pageSpec = 'v1.2.3@the-component:ROOT:page-one.adoc'
      const page = classifyContent(playbook, aggregate).resolvePage(pageSpec)
      expect(page.path).to.equal('modules/ROOT/pages/page-one.adoc')
    })

    it('should return undefined if file not resolved from qualified page spec', () => {
      const pageSpec = 'v1.2.3@the-component:ROOT:no-such-page.adoc'
      const page = classifyContent(playbook, aggregate).resolvePage(pageSpec)
      expect(page).not.to.exist()
    })

    it('should find file by contextual page spec', () => {
      const pageSpec = 'ROOT:page-one.adoc'
      const context = { component: 'the-component', version: 'v1.2.3' }
      const page = classifyContent(playbook, aggregate).resolvePage(pageSpec, context)
      expect(page.path).to.equal('modules/ROOT/pages/page-one.adoc')
    })

    it('should return undefined if file not resolved from contextual page spec', () => {
      const pageSpec = 'ROOT:page-one.adoc'
      const context = {}
      const page = classifyContent(playbook, aggregate).resolvePage(pageSpec, context)
      expect(page).not.to.exist()
    })
  })

  describe('#resolveResource()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/assets/images/foo.png'), createFile('modules/ROOT/pages/page-one.adoc')],
        },
      ]
    })

    it('should find file by qualified resource spec', () => {
      const pageSpec = 'v1.2.3@the-component:ROOT:image$foo.png'
      const page = classifyContent(playbook, aggregate).resolveResource(pageSpec)
      expect(page.path).to.equal('modules/ROOT/assets/images/foo.png')
    })
  })

  describe('#getById()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/assets/images/foo.png'), createFile('modules/ROOT/pages/page-one.adoc')],
        },
      ]
    })

    it('should find file by ID', () => {
      const page = classifyContent(playbook, aggregate).getById({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'page-one.adoc',
      })
      expect(page.path).to.equal('modules/ROOT/pages/page-one.adoc')
    })

    it('should return undefined if ID is not found', () => {
      const page = classifyContent(playbook, aggregate).getById({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'unknown-page.adoc',
      })
      expect(page).not.to.exist()
    })
  })

  describe('#getByPath()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/pages/_partials/tables/options.adoc')],
        },
      ]
    })

    it('should find file by path', () => {
      const page = classifyContent(playbook, aggregate).getByPath({
        component: 'the-component',
        version: 'v1.2.3',
        path: 'modules/ROOT/pages/_partials/tables/options.adoc',
      })
      expect(page.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'partial',
        relative: 'tables/options.adoc',
      })
    })

    it('should return undefined if path is not found', () => {
      const page = classifyContent(playbook, aggregate).getByPath({
        component: 'the-component',
        version: 'v1.2.3',
        path: 'modules/ROOT/pages/_partials/does-not-exist.adoc',
      })
      expect(page).not.to.exist()
    })
  })

  describe('#getSiteStartPage()', () => {
    let contentCatalog

    beforeEach(() => {
      contentCatalog = new ContentCatalog()
      contentCatalog.getById = spy(contentCatalog.getById)
    })

    it('should return undefined if site start page does not exist in catalog', () => {
      expect(contentCatalog.getSiteStartPage()).to.not.exist()
      expect(contentCatalog.getById).to.have.been.called.with(START_PAGE_ID)
    })

    it('should return site start page if stored as a concrete page', () => {
      const startPageSrc = Object.assign({}, START_PAGE_ID, {
        basename: 'index.adoc',
        stem: 'index',
        mediaType: 'text/asciidoc',
      })
      contentCatalog.addFile({
        contents: Buffer.from('I am your home base!'),
        src: startPageSrc,
      })
      const result = contentCatalog.getSiteStartPage()
      expect(contentCatalog.getById).to.have.been.called.with(START_PAGE_ID)
      expect(result).to.exist()
      expect(result.src).to.equal(startPageSrc)
      expect(result.contents.toString()).to.equal('I am your home base!')
    })

    it('should return reference for site start page stored as an alias', () => {
      const thePageId = {
        component: 'the-component',
        version: '1.0.1',
        module: 'ROOT',
        family: 'page',
        relative: 'home.adoc',
      }
      const thePageSrc = Object.assign({}, thePageId, {
        basename: 'home.adoc',
        stem: 'home',
        mediaType: 'text/asciidoc',
      })
      contentCatalog.addFile({
        contents: Buffer.from('I am your home base!'),
        src: thePageSrc,
      })
      const startPageSrc = Object.assign({}, START_PAGE_ID, {
        family: 'alias',
        basename: 'index.adoc',
        stem: 'index',
        mediaType: 'text/asciidoc',
      })
      contentCatalog.addFile({
        src: startPageSrc,
        rel: contentCatalog.getById(thePageId),
      })
      contentCatalog.getById = spy(contentCatalog.getById)
      const result = contentCatalog.getSiteStartPage()
      expect(contentCatalog.getById)
        .on.nth(1)
        .called.with(START_PAGE_ID)
      expect(contentCatalog.getById)
        .on.nth(2)
        .called.with(Object.assign({}, START_PAGE_ID, { family: 'alias' }))
      expect(result).to.exist()
      expect(result.src).to.equal(thePageSrc)
      expect(result.contents.toString()).to.equal('I am your home base!')
    })
  })
})
