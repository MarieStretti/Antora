/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const classifyContent = require('@antora/content-classifier')
const path = require('path')
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
      urls: { htmlExtensionStyle: 'default' },
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

  it('should classify a page', () => {
    aggregate[0].files.push(createFile('modules/ROOT/pages/page-one.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
    expect(files[0].src).to.include({
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
  })

  it('should classify a page in a topic dir', () => {
    aggregate[0].files.push(createFile('modules/ROOT/pages/the-topic/page-one.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/ROOT/pages/the-topic/page-one.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'page',
      relative: 'the-topic/page-one.adoc',
      basename: 'page-one.adoc',
      moduleRootPath: '../..',
    })
  })

  it('should classify a partial page', () => {
    aggregate[0].files.push(createFile('modules/ROOT/pages/_partials/foo.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/ROOT/pages/_partials/foo.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'partial',
      relative: 'foo.adoc',
      basename: 'foo.adoc',
      moduleRootPath: '../..',
    })
  })

  it('should classify an image', () => {
    aggregate[0].files.push(createFile('modules/ROOT/assets/images/foo.png'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/ROOT/assets/images/foo.png')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'image',
      relative: 'foo.png',
      basename: 'foo.png',
      moduleRootPath: '../..',
    })
  })

  it('should classify an attachment', () => {
    aggregate[0].files.push(createFile('modules/ROOT/assets/attachments/example.zip'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/ROOT/assets/attachments/example.zip')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'attachment',
      relative: 'example.zip',
      basename: 'example.zip',
      moduleRootPath: '../..',
    })
  })

  it('should classify an example', () => {
    aggregate[0].files.push(createFile('modules/ROOT/examples/foo.xml'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/ROOT/examples/foo.xml')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'example',
      relative: 'foo.xml',
      basename: 'foo.xml',
      moduleRootPath: '..',
    })
  })

  it('should not classify a navigation file if not referenced in component desc', () => {
    aggregate[0].files.push(createFile('modules/ROOT/nav.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files).to.have.lengthOf(0)
  })

  it('should classify a navigation file if referenced in component desc', () => {
    aggregate[0].nav = ['modules/ROOT/nav.adoc']
    aggregate[0].files.push(createFile('modules/ROOT/nav.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files).to.have.lengthOf(1)
    expect(files[0].path).to.equal('modules/ROOT/nav.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'navigation',
      relative: 'nav.adoc',
      basename: 'nav.adoc',
      moduleRootPath: '.',
    })
  })

  it('should assign a nav.index property to navigation file according to order listed in component desc', () => {
    aggregate[0].nav = ['modules/ROOT/nav.adoc', 'modules/module-a/nav.adoc', 'modules/module-b/nav.adoc']
    aggregate[0].files.push(
      ...[
        createFile('modules/module-b/nav.adoc'),
        createFile('modules/ROOT/nav.adoc'),
        createFile('modules/module-a/nav.adoc'),
      ]
    )
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('modules/module-b/nav.adoc')
    expect(files[0].nav.index).to.equal(2)
    expect(files[0].src.module).to.equal('module-b')
    expect(files[0].src.relative).to.equal('nav.adoc')
    expect(files[1].path).to.equal('modules/ROOT/nav.adoc')
    expect(files[1].nav.index).to.equal(0)
    expect(files[1].src.module).to.equal('ROOT')
    expect(files[1].src.relative).to.equal('nav.adoc')
    expect(files[2].path).to.equal('modules/module-a/nav.adoc')
    expect(files[2].nav.index).to.equal(1)
    expect(files[2].src.module).to.equal('module-a')
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
    expect(files[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
    expect(files[0].src).to.include({ component: 'the-component', version: 'v1.2.3', module: 'ROOT' })
    expect(files[1].path).to.equal('modules/basics/pages/page-two.adoc')
    expect(files[1].src).to.include({ component: 'the-other-component', version: 'v4.5.6', module: 'basics' })
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

  describe('should assign correct out and pub properties to files', () => {
    it('complete example', () => {
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/the-module/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/page-one.html',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('page in topic dirs', () => {
      aggregate[0].files.push(createFile('modules/the-module/pages/subpath-foo/subpath-bar/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
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
      expect(files[0].out).to.include({
        dirname: 'the-component/v1.2.3/the-module/_images',
        basename: 'foo.png',
        path: 'the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/_images/foo.png',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('page with drop html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'page-one.html',
        path: 'the-component/v1.2.3/the-module/the-topic/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/page-one',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-topic/page-one',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('index page with drop html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/index.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'index.html',
        path: 'the-component/v1.2.3/the-module/the-topic/index.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-topic/',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('indexify html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic/page-one',
        basename: 'index.html',
        path: 'the-component/v1.2.3/the-module/the-topic/page-one/index.html',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/page-one/',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-topic/page-one/',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
    })

    it('index page with indexify html extension strategy', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      aggregate[0].files.push(createFile('modules/the-module/pages/the-topic/index.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: 'the-component/v1.2.3/the-module/the-topic',
        basename: 'index.html',
        path: 'the-component/v1.2.3/the-module/the-topic/index.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-topic/',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-topic/',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })
  })

  describe('findBy()', () => {
    beforeEach(() => {
      aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v1.2.3',
          files: [createFile('modules/ROOT/assets/images/foo.png'), createFile('modules/ROOT/pages/page-one.adoc')],
        },
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v4.5.6',
          files: [
            createFile('modules/ROOT/assets/images/launch-page.png'),
            createFile('modules/ROOT/assets/images/directory-structure.svg'),
            createFile('modules/ROOT/pages/_partials/foo.adoc'),
            createFile('modules/ROOT/pages/page-one.adoc'),
            createFile('modules/ROOT/pages/page-two.adoc'),
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
      ]
    })

    it('should find files by family', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ family: 'page' })
      expect(pages).to.have.lengthOf(4)
      expect(pages[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src.version).to.equal('v4.5.6')
      expect(pages[2].path).to.equal('modules/ROOT/pages/page-two.adoc')
      expect(pages[3].path).to.equal('modules/ROOT/pages/page-three.adoc')
    })

    it('should find files by component', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ component: 'the-component' })
      expect(pages).to.have.lengthOf(7)
      expect(pages[0].path).to.equal('modules/ROOT/assets/images/foo.png')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src.version).to.equal('v1.2.3')
      expect(pages[2].path).to.equal('modules/ROOT/assets/images/launch-page.png')
      expect(pages[2].src.version).to.equal('v4.5.6')
      expect(pages[3].path).to.equal('modules/ROOT/assets/images/directory-structure.svg')
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
      expect(pages[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src.version).to.equal('v4.5.6')
    })

    it('should find files by extname', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ extname: '.svg' })
      expect(pages).to.have.lengthOf(1)
      expect(pages[0].path).to.equal('modules/ROOT/assets/images/directory-structure.svg')
      expect(pages[0].src.version).to.equal('v4.5.6')
    })

    it('should find all versions of a page', () => {
      const pages = classifyContent(playbook, aggregate).findBy({
        component: 'the-component',
        module: 'ROOT',
        family: 'page',
        relative: 'page-one.adoc',
      })
      expect(pages).to.have.lengthOf(2)
      expect(pages[0].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[0].src).to.include({ component: 'the-component', version: 'v1.2.3' })
      expect(pages[1].path).to.equal('modules/ROOT/pages/page-one.adoc')
      expect(pages[1].src).to.include({ component: 'the-component', version: 'v4.5.6' })
    })
  })

  describe('getById()', () => {
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

  describe('getByPath()', () => {
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
