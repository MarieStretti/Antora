/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const classifyContent = require('@antora/content-classifier')
const ContentCatalog = require('@antora/content-classifier/lib/content-catalog')
const File = require('vinyl')
const { posix: path } = require('path')
const mimeTypes = require('@antora/content-aggregator/lib/mime-types-with-asciidoc')
const { COMPONENT_DESC_FILENAME } = require('@antora/content-aggregator/lib/constants')

describe('classifyContent()', () => {
  let playbook, aggregate

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
      site: { url: 'https://the-website.tld' },
      urls: { htmlExtensionStyle: 'default', redirectStrategy: 'static' },
    }
    aggregate = [
      {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        files: [],
      },
    ]
  })

  describe('register components', () => {
    it('should register all components', () => {
      aggregate.push({
        name: 'another-component',
        title: 'Another Component',
        version: 'v1.0.0',
        files: [],
      })
      const contentCatalog = classifyContent(playbook, aggregate)
      const components = contentCatalog.getComponents()
      expect(components).to.have.lengthOf(2)
      const names = components.map((component) => component.name)
      // QUESTION should components be pre-sorted, and if so, by which property?
      expect(names).to.have.members(['the-component', 'another-component'])
    })

    it('should register all versions of a component in sorted order', () => {
      aggregate.push({
        name: 'the-component',
        title: 'The Component',
        version: 'v2.0.0',
        files: [],
      })
      aggregate.push({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.0.0',
        files: [],
      })
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.name).to.equal('the-component')
      const versions = component.versions.map((version) => version.version)
      expect(versions).to.eql(['v2.0.0', 'v1.2.3', 'v1.0.0'])
    })

    it('should update title of component to match title of greatest version', () => {
      aggregate.push({
        name: 'the-component',
        title: 'The Component (Newest)',
        version: 'v2.0.0',
        files: [],
      })
      aggregate.push({
        name: 'the-component',
        title: 'The Component (Patch)',
        version: 'v1.2.4',
        files: [],
      })
      aggregate.push({
        name: 'the-component',
        title: 'The Component (Oldest)',
        version: 'v1.0.0',
        files: [],
      })
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.title).to.equal('The Component (Newest)')
      expect(component.versions[0].title).to.equal('The Component (Newest)')
      expect(component.versions[1].title).to.equal('The Component (Patch)')
    })

    it('should configure latestVersion property to resolve to greatest version', () => {
      aggregate.push({
        name: 'the-component',
        title: 'The Component',
        version: 'v2.0.0',
        files: [],
      })
      aggregate.push({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.0.0',
        files: [],
      })
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.latestVersion).to.exist()
      expect(component.latestVersion.version).to.equal('v2.0.0')
      // use low-level operation to ensure property is dynamic
      component.versions.unshift({
        version: 'v3.0.0',
        title: 'The Component',
        url: '/the-component/v3.0.0/index.html',
      })
      expect(component.latestVersion.version).to.equal('v3.0.0')
    })

    it('should not set url on component if start page cannot be resolved', () => {
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.url).to.be.undefined()
      expect(component.versions[0].url).to.be.undefined()
    })

    it('should throw when adding a duplicate version of a component', () => {
      aggregate.push({
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        files: [],
      })
      expect(() => classifyContent(playbook, aggregate)).to.throw('version')
    })
  })

  describe('classify files', () => {
    it('should classify a page', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'page-one.adoc',
        basename: 'page-one.adoc',
        stem: 'page-one',
        extname: '.adoc',
        moduleRootPath: '..',
      })
      expect(file.out).to.include({
        path: 'the-component/v1.2.3/page-one.html',
        dirname: 'the-component/v1.2.3',
        basename: 'page-one.html',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/page-one.html',
        moduleRootPath: '.',
        rootPath: '../..',
      })
    })

    it('should classify a page in a topic dir', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/ROOT/pages/the-topic/page-one.adoc')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/page-one.adoc',
        basename: 'page-one.adoc',
        moduleRootPath: '../..',
      })
      expect(file.out).to.include({
        path: 'the-component/v1.2.3/the-topic/page-one.html',
        dirname: 'the-component/v1.2.3/the-topic',
        basename: 'page-one.html',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../..',
      })
    })

    it('should set the component url to the index page of the ROOT module by default', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/index.adoc'))
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.url).to.equal('/the-component/v1.2.3/index.html')
      expect(component.versions[0].url).to.equal('/the-component/v1.2.3/index.html')
    })

    it('should allow the start page to be specified for a component version', () => {
      aggregate[0].start_page = 'ROOT:home.adoc'
      aggregate[0].files.push(createFile('modules/ROOT/pages/home.adoc'))
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.url).to.equal('/the-component/v1.2.3/home.html')
      expect(component.versions[0].url).to.equal('/the-component/v1.2.3/home.html')
    })

    it('should throw error if start page specified for component version cannot be resolved', () => {
      aggregate[0].start_page = 'no-such-page'
      aggregate[0].files.push(createFile('modules/ROOT/pages/home.adoc'))
      expect(() => classifyContent(playbook, aggregate)).to.throw(/Start page .* not found/)
    })

    it('should update url of component to match url of greatest version', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/index.adoc'))
      aggregate.push({
        name: 'the-component',
        title: 'The Component',
        version: 'v2.0.0',
        start_page: 'ROOT:home.adoc',
        files: [createFile('modules/ROOT/pages/home.adoc')],
      })
      const component = classifyContent(playbook, aggregate).getComponent('the-component')
      expect(component).to.exist()
      expect(component.url).to.equal('/the-component/v2.0.0/home.html')
      expect(component.versions[0].url).to.equal('/the-component/v2.0.0/home.html')
      expect(component.versions[1].url).to.equal('/the-component/v1.2.3/index.html')
    })

    it('should classify a partial page', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/_partials/foo.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/ROOT/pages/_partials/foo.adoc')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'partial',
        relative: 'foo.adoc',
        basename: 'foo.adoc',
        moduleRootPath: '../..',
      })
      expect(file.out).to.not.exist()
      expect(file.pub).to.not.exist()
    })

    it('should classify an image', () => {
      aggregate[0].files.push(createFile('modules/ROOT/assets/images/foo.png'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/ROOT/assets/images/foo.png')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'image',
        relative: 'foo.png',
        basename: 'foo.png',
        moduleRootPath: '../..',
      })
      expect(file.out).to.include({
        path: 'the-component/v1.2.3/_images/foo.png',
        dirname: 'the-component/v1.2.3/_images',
        basename: 'foo.png',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/_images/foo.png',
      })
    })

    it('should classify an attachment', () => {
      aggregate[0].files.push(createFile('modules/ROOT/assets/attachments/example.zip'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/ROOT/assets/attachments/example.zip')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'attachment',
        relative: 'example.zip',
        basename: 'example.zip',
        moduleRootPath: '../..',
      })
      expect(file.out).to.include({
        path: 'the-component/v1.2.3/_attachments/example.zip',
        dirname: 'the-component/v1.2.3/_attachments',
        basename: 'example.zip',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/_attachments/example.zip',
      })
    })

    it('should classify an example', () => {
      aggregate[0].files.push(createFile('modules/ROOT/examples/foo.xml'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/ROOT/examples/foo.xml')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'example',
        relative: 'foo.xml',
        basename: 'foo.xml',
        moduleRootPath: '..',
      })
      expect(file.out).to.not.exist()
      expect(file.pub).to.not.exist()
    })

    it('should classify a navigation file in module', () => {
      aggregate[0].nav = ['modules/module-a/nav.adoc']
      aggregate[0].files.push(createFile('modules/module-a/pages/index.adoc'))
      aggregate[0].files.push(createFile('modules/module-a/nav.adoc'))
      const contentCatalog = classifyContent(playbook, aggregate)
      const files = contentCatalog.findBy({ family: 'navigation' })
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/module-a/nav.adoc')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'module-a',
        family: 'navigation',
        relative: 'nav.adoc',
        basename: 'nav.adoc',
        moduleRootPath: '.',
      })
      expect(file.out).to.not.exist()
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/module-a/',
        moduleRootPath: '.',
      })
    })

    it('should classify a navigation file in subdir of module', () => {
      aggregate[0].nav = ['modules/module-a/nav/primary.adoc']
      aggregate[0].files.push(createFile('modules/module-a/nav/primary.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/module-a/nav/primary.adoc')
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'module-a',
        family: 'navigation',
        relative: 'nav/primary.adoc',
        basename: 'primary.adoc',
        moduleRootPath: '..',
      })
      expect(file.out).to.not.exist()
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/module-a/',
        moduleRootPath: '.',
      })
    })

    it('should classify a navigation file outside of module', () => {
      aggregate[0].nav = ['modules/nav.adoc']
      aggregate[0].files.push(createFile('modules/nav.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.path).to.equal('modules/nav.adoc')
      expect(file.src.module).to.not.exist()
      expect(file.src).to.include({
        component: 'the-component',
        version: 'v1.2.3',
        family: 'navigation',
        relative: 'modules/nav.adoc',
        basename: 'nav.adoc',
      })
      expect(file.out).to.not.exist()
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/',
        moduleRootPath: '.',
      })
    })

    it('should not classify a navigation file if not in nav list', () => {
      aggregate[0].files.push(createFile('modules/ROOT/nav.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(0)
    })

    // QUESTION should we throw an error or warning?
    it('should not register navigation file that points to non-existent file', () => {
      aggregate[0].nav = ['modules/ROOT/no-such-file.adoc']
      aggregate[0].files.push(createFile('modules/ROOT/pages/the-page.adoc'))
      aggregate[0].files.push(createFile('modules/ROOT/nav.adoc'))
      const contentCatalog = classifyContent(playbook, aggregate)
      expect(contentCatalog.findBy({ family: 'navigation' })).to.have.lengthOf(0)
    })

    it('should assign a nav.index property to navigation file according to order listed in component descriptor', () => {
      aggregate[0].nav = ['modules/ROOT/nav.adoc', 'modules/module-a/nav.adoc', 'modules/module-b/nav.adoc']
      aggregate[0].files.push(
        ...[
          createFile('modules/module-b/nav.adoc'),
          createFile('modules/ROOT/nav.adoc'),
          createFile('modules/module-a/nav.adoc'),
        ]
      )
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(3)
      files.sort((a, b) => (a.nav.index < b.nav.index ? -1 : a.nav.index > b.nav.index ? 1 : 0))
      expect(files[0].path).to.equal('modules/ROOT/nav.adoc')
      expect(files[0].nav.index).to.equal(0)
      expect(files[0].src.module).to.equal('ROOT')
      expect(files[0].src.relative).to.equal('nav.adoc')
      expect(files[1].path).to.equal('modules/module-a/nav.adoc')
      expect(files[1].nav.index).to.equal(1)
      expect(files[1].src.module).to.equal('module-a')
      expect(files[1].src.relative).to.equal('nav.adoc')
      expect(files[2].path).to.equal('modules/module-b/nav.adoc')
      expect(files[2].nav.index).to.equal(2)
      expect(files[2].src.module).to.equal('module-b')
      expect(files[2].src.relative).to.equal('nav.adoc')
    })

    it('should not classify files that do not fall in the standard project structure', () => {
      aggregate[0].files.push(
        ...[
          createFile(COMPONENT_DESC_FILENAME),
          createFile('README.adoc'),
          createFile('modules/ROOT/_attributes.adoc'),
          createFile('modules/ROOT/assets/bad-file.png'),
          createFile('modules/ROOT/pages/bad-file.xml'),
          createFile('modules/ROOT/documents/index.adoc'),
          createFile('modules/ROOT/pages/_attributes.adoc'),
          createFile('modules/ROOT/bad-folder/bad-file.yml'),
        ]
      )
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(0)
    })

    it('should classify files from multiple components and versions', () => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/pages/page-one.adoc')],
        },
        {
          name: 'the-other-component',
          title: 'The Other Component',
          version: 'v4.5.6',
          files: [createFile('modules/basics/pages/page-two.adoc')],
        },
      ]
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(2)
      files.sort((a, b) => a.src.module.localeCompare(b.src.module))
      expect(files[0].path).to.equal('modules/basics/pages/page-two.adoc')
      expect(files[0].src).to.include({ component: 'the-other-component', version: 'v4.5.6', module: 'basics' })
      expect(files[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(files[1].src).to.include({ component: 'the-component', version: 'v1.2.3', module: 'ROOT' })
    })

    it('should throw when two identical files are found in different sources', () => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/pages/page-one.adoc')],
        },
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/pages/page-one.adoc')],
        },
      ]
      expect(() => classifyContent({}, aggregate)).to.throw()
    })
  })

  describe('site start page', () => {
    it('should not register site start page if not specified', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/index.adoc'))
      const contentCatalog = classifyContent(playbook, aggregate)
      const files = contentCatalog.getFiles()
      expect(files).to.have.lengthOf(1)
      const expected = contentCatalog.getById({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'index.adoc',
      })
      expect(files[0]).to.eql(expected)
    })

    it('should register site start page if specified', () => {
      playbook.site.startPage = 'v1.2.3@the-component:ROOT:index'
      aggregate[0].files.push(createFile('modules/ROOT/pages/index.adoc'))
      const contentCatalog = classifyContent(playbook, aggregate)
      const files = contentCatalog.getFiles()
      expect(files).to.have.lengthOf(2)
      const expected = contentCatalog.getById({
        component: '',
        version: '',
        module: '',
        family: 'alias',
        relative: 'index.adoc',
      })
      expect(expected).to.exist()
    })

    it('should throw error if site start page not found', () => {
      playbook.site.startPage = 'no-such-page'
      aggregate[0].files.push(createFile('modules/ROOT/pages/index.adoc'))
      expect(() => classifyContent(playbook, aggregate)).to.throw(/Specified start page .* not found/)
    })
  })

  describe('assign correct out and pub properties to files', () => {
    it('complete example', () => {
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/the-module/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('page in topic dirs', () => {
      aggregate[0].files.push(createFile('modules/the-module/pages/subpath-foo/subpath-bar/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/subpath-foo/subpath-bar',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/the-module/subpath-foo/subpath-bar/page-one.html',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
    })

    it('page without topic dir', () => {
      aggregate[0].files.push(createFile('modules/the-module/pages/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/the-module/page-one.html',
        moduleRootPath: '.',
        rootPath: '../../..',
      })
    })

    it('page in ROOT module', () => {
      aggregate[0].files.push(createFile('modules/ROOT/pages/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/page-one.html',
        moduleRootPath: '.',
        rootPath: '../..',
      })
    })

    it('with master version', () => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'master',
          files: [createFile('modules/the-module/pages/page-one.adoc')],
        },
      ]
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/the-module',
        basename: 'page-one.html',
        path: 'the-component/the-module/page-one.html',
        moduleRootPath: '.',
        rootPath: '../..',
      })
    })

    it('with ROOT module and master version', () => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'master',
          files: [createFile('modules/ROOT/pages/page-one.adoc')],
        },
      ]
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component',
        basename: 'page-one.html',
        path: 'the-component/page-one.html',
        moduleRootPath: '.',
        rootPath: '..',
      })
    })

    it('image', () => {
      aggregate[0].files.push(createFile('modules/the-module/assets/images/foo.png'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/_images',
        basename: 'foo.png',
        path: 'the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('attachment', () => {
      aggregate[0].files.push(createFile('modules/the-module/assets/attachments/example.zip'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/_attachments',
        basename: 'example.zip',
        path: 'the-component/v1.2.3/the-module/_attachments/example.zip',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('image with drop html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('modules/the-module/assets/images/foo.png'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/_images',
        basename: 'foo.png',
        path: 'the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('page with drop html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/the-module/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/page-one',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('index page with drop html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/index.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'index.html',
        path: 'the-component/v1.2.3/the-module/the-topic/index.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('indexify html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic/page-one',
        basename: 'index.html',
        path: 'the-component/v1.2.3/the-module/the-topic/page-one/index.html',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/page-one/',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
    })

    it('index page with indexify html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/index.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files).to.have.lengthOf(1)
      const file = files[0]
      expect(file.out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'index.html',
        path: 'the-component/v1.2.3/the-module/the-topic/index.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(file.pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })
  })

  describe('ContentCatalog', () => {
    it('should initialize url options on ContentCatalog to default values', () => {
      delete playbook.urls
      const contentCatalog = classifyContent(playbook, aggregate)
      expect(contentCatalog.htmlUrlExtensionStyle).to.equal('default')
      //expect(contentCatalog.urlRedirectStrategy).to.equal('static')
    })

    it('should set url options on ContentCatalog from playbook', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      playbook.urls.redirectStrategy = 'nginx'
      const contentCatalog = classifyContent(playbook, aggregate)
      expect(contentCatalog.htmlUrlExtensionStyle).to.equal('indexify')
      //expect(contentCatalog.urlRedirectStrategy).to.equal('nginx')
    })
  })

  describe('ContentCatalog#findBy()', () => {
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
      const pages = classifyContent(playbook, aggregate).findBy({ family: 'page' })
      expect(pages).to.have.lengthOf(4)
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

    it('should find files by basename', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ basename: 'page-one.adoc' })
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

  describe('ContentCatalog#addFile()', () => {
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
        family: 'navigation',
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

  describe('ContentCatalog#registerPageAlias()', () => {
    // QUESTION should we throw an error or warning?
    it('should not register alias if page spec is invalid', () => {
      expect(new ContentCatalog().registerPageAlias('invalid::', {})).to.be.undefined()
    })

    it('should register an alias for target file given a valid qualified page spec', () => {
      const targetSrc = {
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
      contentCatalog.addFile(new File({ src: targetSrc }))
      const targetFile = contentCatalog.getById(targetSrc)
      const result = contentCatalog.registerPageAlias('1.0.0@the-component:ROOT:the-topic/alias.adoc', targetFile)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.0.0',
        module: 'ROOT',
        family: 'alias',
        relative: 'the-topic/alias.adoc',
      })
      expect(result.path).to.equal(targetFile.path)
      expect(result).to.have.property('rel')
      expect(result.rel).to.equal(targetFile)
      expect(contentCatalog.getById(result.src)).to.equal(result)
    })

    it('should register an alias for target file given a valid contextual page spec', () => {
      const targetSrc = {
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
      contentCatalog.addFile(new File({ src: targetSrc }))
      const targetFile = contentCatalog.getById(targetSrc)
      const result = contentCatalog.registerPageAlias('alias.adoc', targetFile)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
      expect(result.path).to.equal(targetFile.path)
      expect(result).to.have.property('rel')
      expect(result.rel).to.equal(targetFile)
      expect(contentCatalog.getById(result.src)).to.equal(result)
    })

    it('should set version of alias to latest version of component if version not specified', () => {
      const targetSrc = {
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
      contentCatalog.registerComponentVersion('another-component', '1.0', 'Another Component', '/the-component/1.0/')
      contentCatalog.addFile(new File({ src: targetSrc }))
      const targetFile = contentCatalog.getById(targetSrc)
      const result = contentCatalog.registerPageAlias('another-component::alias.adoc', targetFile)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src).to.include({
        component: 'another-component',
        version: '1.0',
        module: 'ROOT',
        family: 'alias',
        relative: 'alias.adoc',
      })
    })

    it('should not set version of alias if version not specified and component not registered', () => {
      const targetSrc = {
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
      contentCatalog.addFile(new File({ src: targetSrc }))
      const targetFile = contentCatalog.getById(targetSrc)
      const result = contentCatalog.registerPageAlias('another-component::alias.adoc', targetFile)
      expect(result).to.exist()
      expect(result).to.have.property('src')
      expect(result.src.version).to.equal('master')
    })

    it('should register an alias correctly when the HTML URL extension style is indexify', () => {
      const targetSrc = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog({ urls: { htmlExtensionStyle: 'indexify' } })
      contentCatalog.addFile(new File({ src: targetSrc }))
      const targetFile = contentCatalog.getById(targetSrc)
      const result = contentCatalog.registerPageAlias('alias.adoc', targetFile)
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
      const targetSrc = {
        component: 'the-component',
        version: '1.2.3',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
        basename: 'the-page.adoc',
        stem: 'the-page',
        mediaType: 'text/asciidoc',
      }
      const contentCatalog = new ContentCatalog({ urls: { htmlExtensionStyle: 'drop' } })
      contentCatalog.addFile(new File({ src: targetSrc }))
      const targetFile = contentCatalog.getById(targetSrc)
      const result = contentCatalog.registerPageAlias('alias.adoc', targetFile)
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

  describe('ContentCatalog#resolvePage()', () => {
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

  describe('ContentCatalog#getById()', () => {
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

  describe('ContentCatalog#getByPath()', () => {
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
})
