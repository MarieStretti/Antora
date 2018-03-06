/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const classifyContent = require('@antora/content-classifier')
const ContentCatalog = require('@antora/content-classifier/lib/content-catalog')
const File = require('@antora/content-classifier/lib/file')
const mimeTypes = require('@antora/content-aggregator/lib/mime-types-with-asciidoc')
const { posix: path } = require('path')

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

  describe('#addComponentVersion()', () => {
    it('should add new component to catalog if component is not present', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
      const url = '/the-component/1.0.0/index.html'
      const contentCatalog = new ContentCatalog()
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
      contentCatalog.addComponentVersion(name, version, title)
      const components = contentCatalog.getComponents()
      expect(components).to.have.lengthOf(1)
      expect(components[0]).to.deep.include({
        name,
        title,
        url,
        versions: [{ title, version, url }],
      })
      expect(components[0].latestVersion).to.eql({ title, version, url })
    })

    it('should add new version to existing component if component is already present', () => {
      const name = 'the-component'
      const version1 = '1.0.0'
      const title1 = 'The Component (1.0.0)'
      const url1 = '/the-component/1.0.0/index.html'
      const version2 = '2.0.0'
      const title2 = 'The Component (2.0.0)'
      const url2 = '/the-component/2.0.0/index.html'
      const indexPageT = { family: 'page', relative: 'index.adoc', stem: 'index', mediaType: 'text/asciidoc' }
      const contentCatalog = new ContentCatalog()
      contentCatalog.addFile({ src: Object.assign({ component: name, version: version1, module: 'ROOT' }, indexPageT) })
      contentCatalog.addComponentVersion(name, version1, title1)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      const component = contentCatalog.getComponent(name)

      contentCatalog.addFile({ src: Object.assign({ component: name, version: version2, module: 'ROOT' }, indexPageT) })
      contentCatalog.addComponentVersion(name, version2, title2)
      expect(contentCatalog.getComponents()).to.have.lengthOf(1)
      expect(contentCatalog.getComponent(name)).to.equal(component)
      expect(component).to.deep.include({
        name,
        title: title2,
        url: url2,
        versions: [{ title: title2, version: version2, url: url2 }, { title: title1, version: version1, url: url1 }],
      })
      expect(component.latestVersion).to.eql({ title: title2, version: version2, url: url2 })
    })

    it('should use url from specified start page', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
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
      contentCatalog.addComponentVersion(name, version, title, 'home.adoc')
      const components = contentCatalog.getComponents()
      expect(components).to.have.lengthOf(1)
      expect(components[0]).to.deep.include({
        name,
        title,
        url,
        versions: [{ title, version, url }],
      })
      expect(components[0].latestVersion).to.eql({ title, version, url })
    })

    it('should throw error if specified start page not found', () => {
      expect(() =>
        new ContentCatalog().addComponentVersion('the-component', '1.0.0', 'The Component', 'home.adoc')
      ).to.throw('Start page specified for 1.0.0@the-component not found: home.adoc')
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
      contentCatalog.addComponentVersion(name, version, title)
      const component = contentCatalog.getComponent(name)
      expect(component.url).to.equal(url)
    })

    it('should use url of synthetic index page in ROOT module if page not found', () => {
      const name = 'the-component'
      const version = '1.0.0'
      const title = 'The Component'
      const url = '/the-component/1.0.0/index.html'
      const contentCatalog = new ContentCatalog()
      contentCatalog.addComponentVersion(name, version, title)
      const component = contentCatalog.getComponent(name)
      expect(component.url).to.equal(url)
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

  describe('#registerPageAlias()', () => {
    let contentCatalog
    let targetPageSrc

    beforeEach(() => {
      contentCatalog = new ContentCatalog()
      contentCatalog.addComponentVersion('the-component', '1.2.3', 'The Component')
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
      contentCatalog.addComponentVersion('the-component', '1.0.0', 'The Component')
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('1.0.0@the-component:ROOT:the-topic/alias.adoc', targetPage)
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
      contentCatalog.addComponentVersion('other-component', '1.0', 'Other Component')
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

    it('should not register alias if component is unknown', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('1.0@unknown-component:ROOT:alias.adoc', targetPage)
      expect(result).to.not.exist()
    })

    it('should not register alias if version not specified and component unknown', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const result = contentCatalog.registerPageAlias('unknown-component::alias.adoc', targetPage)
      expect(result).to.not.exist()
    })

    it('should not allow alias to be registered that matches target page', () => {
      contentCatalog.addFile(new File({ src: targetPageSrc }))
      const targetPage = contentCatalog.getById(targetPageSrc)
      const expectedError = 'Page alias cannot reference itself: 1.2.3@the-component:ROOT:the-page.adoc'
      expect(() => contentCatalog.registerPageAlias(targetPageSrc.relative, targetPage)).to.throw(expectedError)
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
      contentCatalog.addComponentVersion('the-component', '1.2.3', 'The Component')
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
      contentCatalog.addComponentVersion('the-component', '1.2.3', 'The Component')
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
})
