/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')
const classifyContent = require('../lib/index')
const path = require('path')
const mime = require('../../content-aggregator/lib/mime')

const createFile = (filepath) => {
  const basename = path.basename(filepath)
  const extname = path.extname(filepath)
  const stem = path.basename(filepath, extname)
  return {
    path: filepath,
    src: { basename, mediaType: mime.lookup(extname), stem, extname },
  }
}

describe('classifyContent()', () => {
  let playbook, aggregate

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
    aggregate[0].files.push(createFile('/modules/ROOT/documents/page-one.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/documents/page-one.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'page',
      subpath: '',
      moduleRootPath: '..',
    })
  })

  it('should classify a page with a subpath', () => {
    aggregate[0].files.push(createFile('/modules/ROOT/documents/the-subpath/page-one.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/documents/the-subpath/page-one.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'page',
      subpath: 'the-subpath',
      moduleRootPath: '../..',
    })
  })

  it('should classify a partial page', () => {
    aggregate[0].files.push(createFile('/modules/ROOT/documents/_partials/foo.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/documents/_partials/foo.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'fragment',
      subpath: '',
      moduleRootPath: '../..',
    })
  })

  it('should classify an image', () => {
    aggregate[0].files.push(createFile('/modules/ROOT/assets/images/foo.png'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/assets/images/foo.png')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'image',
      subpath: '',
      moduleRootPath: '../..',
    })
  })

  it('should classify an attachment', () => {
    aggregate[0].files.push(createFile('/modules/ROOT/assets/attachments/example.zip'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/assets/attachments/example.zip')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'attachment',
      subpath: '',
      moduleRootPath: '../..',
    })
  })

  it('should classify an example', () => {
    aggregate[0].files.push(createFile('/modules/ROOT/examples/foo.xml'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/examples/foo.xml')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'example',
      subpath: '',
      moduleRootPath: '..',
    })
  })

  it('should not classify a navigation if not referenced in docs-component.yml', () => {
    aggregate[0].files.push(createFile('/modules/ROOT/nav.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files).to.have.lengthOf(0)
  })

  it('should classify a navigation if referenced in docs-component.yml', () => {
    aggregate[0].nav = ['modules/ROOT/nav.adoc']
    aggregate[0].files.push(createFile('/modules/ROOT/nav.adoc'))
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/ROOT/nav.adoc')
    expect(files[0].src).to.include({
      component: 'the-component',
      version: 'v1.2.3',
      module: 'ROOT',
      family: 'navigation',
      subpath: '',
      moduleRootPath: '.',
    })
  })

  it('should assign a nav.index on navigation based on order in docs-component.yml', () => {
    aggregate[0].nav = ['modules/ROOT/nav.adoc', 'modules/module-a/nav.adoc', 'modules/module-b/nav.adoc']
    aggregate[0].files.push(
      ...[
        createFile('/modules/module-b/nav.adoc'),
        createFile('/modules/ROOT/nav.adoc'),
        createFile('/modules/module-a/nav.adoc'),
      ]
    )
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files[0].path).to.equal('/modules/module-b/nav.adoc')
    expect(files[0].nav.index).to.equal(2)
    expect(files[1].path).to.equal('/modules/ROOT/nav.adoc')
    expect(files[1].nav.index).to.equal(0)
    expect(files[2].path).to.equal('/modules/module-a/nav.adoc')
    expect(files[2].nav.index).to.equal(1)
  })

  it('should not classify files that do not follow the Antora standard', () => {
    aggregate[0].files.push(
      ...[
        createFile('/docs-component.yml'),
        createFile('/README.adoc'),
        createFile('/modules/ROOT/_attributes.adoc'),
        createFile('/modules/ROOT/assets/bad-file.png'),
        createFile('/modules/ROOT/documents/bad-file.xml'),
        createFile('/modules/ROOT/documents/_attributes.adoc'),
        createFile('/modules/ROOT/bad-folder/bad-file.yml'),
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
        files: [createFile('/modules/ROOT/documents/page-one.adoc')],
      },
      {
        name: 'the-other-component',
        title: 'The Other Component',
        version: 'v4.5.6',
        files: [createFile('/modules/ROOT/documents/page-two.adoc')],
      },
    ]
    const files = classifyContent(playbook, aggregate).getFiles()
    expect(files).to.have.lengthOf(2)
    expect(files[0].path).to.equal('/modules/ROOT/documents/page-one.adoc')
    expect(files[0].src).to.include({ component: 'the-component', version: 'v1.2.3' })
    expect(files[1].path).to.equal('/modules/ROOT/documents/page-two.adoc')
    expect(files[1].src).to.include({ component: 'the-other-component', version: 'v4.5.6' })
  })

  it('should throw when two identical files are found in different locations', () => {
    const aggregate = [
      {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        files: [createFile('/modules/ROOT/documents/page-one.adoc')],
      },
      {
        name: 'the-component',
        title: 'The Component',
        version: 'v1.2.3',
        files: [createFile('/modules/ROOT/documents/page-one.adoc')],
      },
    ]
    expect(() => classifyContent({}, aggregate)).to.throw()
  })

  describe('should assign correct out and pub properties to files', () => {
    it('full example', () => {
      aggregate[0].files.push(createFile('/modules/the-module/documents/the-subpath/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/the-subpath',
        basename: 'page-one.html',
        path: '/the-component/v1.2.3/the-module/the-subpath/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-subpath/page-one.html',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-subpath/page-one.html',
        rootPath: '../../../..',
      })
    })

    it('example with multiple subpaths', () => {
      aggregate[0].files.push(createFile('/modules/the-module/documents/subpath-foo/subpath-bar/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/subpath-foo/subpath-bar',
        basename: 'page-one.html',
        path: '/the-component/v1.2.3/the-module/subpath-foo/subpath-bar/page-one.html',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
    })

    it('example without topic', () => {
      aggregate[0].files.push(createFile('/modules/the-module/documents/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module',
        basename: 'page-one.html',
        path: '/the-component/v1.2.3/the-module/page-one.html',
        moduleRootPath: '.',
        rootPath: '../../..',
      })
    })

    it('example with ROOT module', () => {
      aggregate[0].files.push(createFile('/modules/ROOT/documents/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3',
        basename: 'page-one.html',
        path: '/the-component/v1.2.3/page-one.html',
        moduleRootPath: '.',
        rootPath: '../..',
      })
    })

    it('example with master version', () => {
      const aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'master',
          files: [createFile('/modules/the-module/documents/page-one.adoc')],
        },
      ]
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/the-module',
        basename: 'page-one.html',
        path: '/the-component/the-module/page-one.html',
        moduleRootPath: '.',
        rootPath: '../..',
      })
    })

    it('example with ROOT module and master version', () => {
      const aggregate = [
        {
          name: 'the-component',
          title: 'The Component',
          version: 'master',
          files: [createFile('/modules/ROOT/documents/page-one.adoc')],
        },
      ]
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component',
        basename: 'page-one.html',
        path: '/the-component/page-one.html',
        moduleRootPath: '.',
        rootPath: '..',
      })
    })

    it('example with assets/images', () => {
      aggregate[0].files.push(createFile('/modules/the-module/assets/images/foo.png'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/_images',
        basename: 'foo.png',
        path: '/the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('example with assets/attachments', () => {
      aggregate[0].files.push(createFile('/modules/the-module/assets/attachments/example.zip'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/_attachments',
        basename: 'example.zip',
        path: '/the-component/v1.2.3/the-module/_attachments/example.zip',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
    })

    it('example with assets/images with drop strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('/modules/the-module/assets/images/foo.png'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/_images',
        basename: 'foo.png',
        path: '/the-component/v1.2.3/the-module/_images/foo.png',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/_images/foo.png',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/_images/foo.png',
        rootPath: '../../../..',
      })
    })

    it('full example with drop strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('/modules/the-module/documents/the-subpath/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/the-subpath',
        basename: 'page-one.html',
        path: '/the-component/v1.2.3/the-module/the-subpath/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-subpath/page-one',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-subpath/page-one',
        rootPath: '../../../..',
      })
    })

    it('index.html example with drop strategy', () => {
      playbook.urls.htmlExtensionStyle = 'drop'
      aggregate[0].files.push(createFile('/modules/the-module/documents/the-subpath/index.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/the-subpath',
        basename: 'index.html',
        path: '/the-component/v1.2.3/the-module/the-subpath/index.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-subpath/',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-subpath/',
        rootPath: '../../../..',
      })
    })

    it('full example with indexify strategy', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      aggregate[0].files.push(createFile('/modules/the-module/documents/the-subpath/page-one.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/the-subpath/page-one',
        basename: 'index.html',
        path: '/the-component/v1.2.3/the-module/the-subpath/page-one/index.html',
        moduleRootPath: '../..',
        rootPath: '../../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-subpath/page-one/',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-subpath/page-one/',
        rootPath: '../../../../..',
      })
    })

    it('index.html page with indexify strategy', () => {
      playbook.urls.htmlExtensionStyle = 'indexify'
      aggregate[0].files.push(createFile('/modules/the-module/documents/the-subpath/index.adoc'))
      const files = classifyContent(playbook, aggregate).getFiles()
      expect(files[0].out).to.include({
        dirname: '/the-component/v1.2.3/the-module/the-subpath',
        basename: 'index.html',
        path: '/the-component/v1.2.3/the-module/the-subpath/index.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      })
      expect(files[0].pub).to.include({
        url: '/the-component/v1.2.3/the-module/the-subpath/',
        absoluteUrl: 'https://the-website.tld/the-component/v1.2.3/the-module/the-subpath/',
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
          files: [
            createFile('/modules/ROOT/assets/images/foo.png'),
            createFile('/modules/ROOT/documents/page-one.adoc'),
          ],
        },
        {
          name: 'the-component',
          title: 'The Component',
          version: 'v4.5.6',
          files: [
            createFile('/modules/ROOT/assets/images/foo.png'),
            createFile('/modules/ROOT/documents/_partials/foo.adoc'),
            createFile('/modules/ROOT/documents/page-one.adoc'),
            createFile('/modules/ROOT/documents/page-two.adoc'),
          ],
        },
        {
          name: 'the-other-component',
          title: 'The Other Title',
          version: 'v4.5.6',
          files: [
            createFile('/modules/ROOT/documents/_partials/bar.adoc'),
            createFile('/modules/ROOT/documents/page-three.adoc'),
          ],
        },
      ]
    })

    it('should find files by family', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ family: 'page' })
      expect(pages).to.have.lengthOf(4)
      expect(pages[0].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[1].src.version).to.equal('v4.5.6')
      expect(pages[2].path).to.equal('/modules/ROOT/documents/page-two.adoc')
      expect(pages[3].path).to.equal('/modules/ROOT/documents/page-three.adoc')
    })

    it('should find files by component', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ component: 'the-component' })
      expect(pages).to.have.lengthOf(6)
      expect(pages[0].path).to.equal('/modules/ROOT/assets/images/foo.png')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[1].src.version).to.equal('v1.2.3')
      expect(pages[2].path).to.equal('/modules/ROOT/assets/images/foo.png')
      expect(pages[2].src.version).to.equal('v4.5.6')
      expect(pages[3].path).to.equal('/modules/ROOT/documents/_partials/foo.adoc')
      expect(pages[4].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[4].src.version).to.equal('v4.5.6')
      expect(pages[5].path).to.equal('/modules/ROOT/documents/page-two.adoc')
    })

    it('should find files by stem', () => {
      const pages = classifyContent(playbook, aggregate).findBy({ stem: 'page-one' })
      expect(pages).to.have.lengthOf(2)
      expect(pages[0].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[0].src.version).to.equal('v1.2.3')
      expect(pages[1].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[1].src.version).to.equal('v4.5.6')
    })

    it('should find all versions of a page', () => {
      const pages = classifyContent(playbook, aggregate).findBy({
        component: 'the-component',
        module: 'ROOT',
        family: 'page',
        subpath: '',
        stem: 'page-one',
      })
      expect(pages).to.have.lengthOf(2)
      expect(pages[0].path).to.equal('/modules/ROOT/documents/page-one.adoc')
      expect(pages[0].src).to.include({ component: 'the-component', version: 'v1.2.3' })
      expect(pages[1].path).to.equal('/modules/ROOT/documents/page-one.adoc')
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
          files: [
            createFile('/modules/ROOT/assets/images/foo.png'),
            createFile('/modules/ROOT/documents/page-one.adoc'),
          ],
        },
      ]
    })

    it('should find file by coordinates', () => {
      const page = classifyContent(playbook, aggregate).getById({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        subpath: '',
        basename: 'page-one.adoc',
      })
      expect(page.path).to.equal('/modules/ROOT/documents/page-one.adoc')
    })

    it('should return null if nothing is found', () => {
      const page = classifyContent(playbook, aggregate).getById({
        component: 'the-component',
        version: 'v1.2.3',
        module: 'ROOT',
        family: 'page',
        subpath: '',
        basename: 'unknown-page.adoc',
      })
      expect(page).not.to.exist()
    })
  })
})
