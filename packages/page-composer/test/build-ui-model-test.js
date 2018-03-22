/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, spy } = require('../../../test/test-utils')
const { buildUiModel, buildSiteUiModel, buildPageUiModel } = require('@antora/page-composer')
const { version: VERSION } = require('@antora/page-composer/package.json')

describe('build UI model', () => {
  let playbook
  let component
  let components
  let contentCatalog
  let file
  let menu
  let navigationCatalog

  beforeEach(() => {
    playbook = {
      site: {
        title: 'Docs Site',
      },
      ui: {
        outputDir: '_/',
      },
    }

    components = [
      {
        name: 'component-c',
        title: 'Component C',
      },
      {
        name: 'the-component',
        title: 'The Component',
        url: '/the-component/1.0/index.html',
        versions: [
          {
            version: '1.0',
            title: 'The Component',
            url: '/the-component/1.0/index.html',
          },
        ],
      },
      {
        name: 'component-b',
        title: 'Component B',
      },
    ]

    component = components[1]

    contentCatalog = {
      getComponent: spy((name) => component),
      getComponents: spy(() => components),
      getSiteStartPage: spy(() => undefined),
    }

    menu = []

    navigationCatalog = {
      getMenu: spy((name, version) => menu),
    }

    file = {
      contents: Buffer.from('contents'),
      src: {
        path: 'modules/ROOT/pages/the-page.adoc',
        component: 'the-component',
        version: '1.0',
        module: 'ROOT',
        relative: 'the-page.adoc',
      },
      pub: {
        url: '/the-component/1.0/the-page.html',
        rootPath: '../..',
      },
    }
  })

  describe('buildSiteUiModel()', () => {
    it('should set antoraVersion property to version of this package', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.antoraVersion).to.equal(VERSION)
    })

    it('should set title property to value of site.title property from playbook', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.title).to.equal('Docs Site')
    })

    it('should set keys property to an empty object if keys property is missing from the playbook', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.keys).to.exist()
      expect(model.keys).to.eql({})
    })

    it('should populate keys property with non-empty key values in site.keys property from playbook', () => {
      playbook.site.keys = {
        googleAnalytics: 'UA-XXXXXXXX-1',
        swiftype: undefined,
      }
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.keys).to.eql({ googleAnalytics: 'UA-XXXXXXXX-1' })
    })

    it('should set components property to array of components from content catalog sorted by title', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(contentCatalog.getComponents).to.have.been.called()
      expect(model.components).to.have.lengthOf(3)
      const componentTitles = model.components.map((component) => component.title)
      expect(componentTitles).to.eql(['Component B', 'Component C', 'The Component'])
    })

    it('should not set url property if site.url property is not set in playbook', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.url).to.not.exist()
    })

    it('should set url property if site.url property is set in playbook', () => {
      playbook.site.url = 'https://example.com'
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.url).to.equal('https://example.com')
    })

    it('should remove trailing slash from site URL before assigning to url property', () => {
      playbook.site.url = 'https://example.com/'
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.url).to.equal('https://example.com')
    })

    it('should not set homeUrl property if site start page is not defined', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(contentCatalog.getSiteStartPage).to.have.been.called()
      expect(model.homeUrl).to.not.exist()
    })

    it('should set homeUrl property to url of site start page', () => {
      const startPage = {
        src: {
          family: 'page',
        },
        pub: { url: '/path/to/home.html' },
      }
      contentCatalog.getSiteStartPage = spy(() => startPage)
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(contentCatalog.getSiteStartPage).to.have.been.called()
      expect(model.homeUrl).to.equal('/path/to/home.html')
    })

    it('should set homeUrl property to url of page to which site start page alias points', () => {
      const startPage = {
        src: {
          family: 'alias',
        },
        rel: {
          pub: { url: '/path/to/home.html' },
        },
      }
      contentCatalog.getSiteStartPage = spy(() => startPage.rel)
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(contentCatalog.getSiteStartPage).to.have.been.called()
      expect(model.homeUrl).to.equal('/path/to/home.html')
    })

    it('should set defaultLayout property on ui property to "default" by default', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.ui.defaultLayout).to.equal('default')
    })

    it('should set defaultLayout property on ui property to value of ui.defaultLayout from playbook', () => {
      playbook.ui.defaultLayout = 'article'
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.ui.defaultLayout).to.equal('article')
    })

    it('should set url property on ui property to root relative path (sans trailing slash)', () => {
      const model = buildSiteUiModel(playbook, contentCatalog)
      expect(model.ui.url).to.equal('/_')
    })
  })

  describe('buildPageUiModel()', () => {
    let site

    beforeEach(() => {
      site = {
        title: 'Docs Site',
        ui: {},
      }
    })

    it('should set component property to component from content catalog', () => {
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expectCalledWith(contentCatalog.getComponent, ['the-component'])
      expect(model.component).to.exist()
      expect(model.component.name).to.equal('the-component')
    })

    it('should set componentVersion property to component version from content catalog', () => {
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.componentVersion).to.exist()
      expect(model.componentVersion).to.equal(component.versions[0])
    })

    it('should set the module and version properties to values from file src object', () => {
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.module).to.exist()
      expect(model.module).to.equal('ROOT')
      expect(model.version).to.exist()
      expect(model.version).to.equal('1.0')
    })

    it('should set url property to pub url of file', () => {
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.url).to.equal('/the-component/1.0/the-page.html')
    })

    it('should set contents property to contents of file', () => {
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.contents).to.equal(file.contents)
    })

    it('should set canonicalUrl property based on pub url of file if file has no versions', () => {
      site.url = 'http://example.com'
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.canonicalUrl).to.equal('http://example.com/the-component/1.0/the-page.html')
    })

    it('should set home property to false if url of page does not match site homeUrl property', () => {
      site.homeUrl = '/path/to/home.html'
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.home).to.be.false()
    })

    it('should set home property to true if url of page matches site homeUrl property', () => {
      site.homeUrl = file.pub.url
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.home).to.be.true()
    })

    it('should set title, description, and keyword based on AsciiDoc attributes', () => {
      file.asciidoc = {
        doctitle: 'The Page Title',
        attributes: {
          description: 'A description of this page',
          keywords: 'keyword-a, keyword-b',
        },
      }
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.title).to.equal(file.asciidoc.doctitle)
      expect(model.description).to.equal(file.asciidoc.attributes.description)
      expect(model.keywords).to.equal(file.asciidoc.attributes.keywords)
    })

    it('should derive value of attributes property based on AsciiDoc attributes prefixed with page-', () => {
      file.asciidoc = {
        attributes: {
          'page-foo': 'bar',
          'page-tags': 'basics,guide',
        },
      }
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.attributes).to.eql({
        foo: 'bar',
        tags: 'basics,guide',
      })
    })

    it('should set layout property to value of page-layout attribute', () => {
      file.asciidoc = {
        attributes: { 'page-layout': 'chapter' },
      }
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.layout).to.equal('chapter')
    })

    it('should set layout property to default layout if the page-layout attribute is not specified', () => {
      site.ui.defaultLayout = 'default'
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.layout).to.equal('default')
    })

    it('should set navigation property to empty array if no navigation is defined for component version', () => {
      menu = undefined
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.navigation).to.exist()
      expect(model.navigation).to.be.empty()
    })

    it('should set navigation property to menu in navigation catalog', () => {
      menu.push({
        order: 0,
        root: true,
        items: [
          {
            content: 'Item',
          },
        ],
      })
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expectCalledWith(navigationCatalog.getMenu, ['the-component', '1.0'])
      expect(model.navigation).to.exist()
      expect(model.navigation).to.equal(menu)
    })

    it('should set breadcrumbs property to path of page in navigation tree', () => {
      let itemB
      let itemC
      menu.push({
        order: 0,
        root: true,
        content: 'Nav Title',
        url: '/the-component/1.0/index.html',
        urlType: 'internal',
        items: [
          {
            content: 'Page A',
            url: '/the-component/1.0/page-a.html',
            urlType: 'internal',
          },
          (itemB = {
            content: 'Page B',
            url: '/the-component/1.0/page-b.html',
            urlType: 'internal',
            items: [
              (itemC = {
                content: 'The Page',
                url: '/the-component/1.0/the-page.html',
                urlType: 'internal',
              }),
              {
                content: 'Page D',
                url: '/the-component/1.0/page-d.html',
                urlType: 'internal',
              },
            ],
          }),
        ],
      })
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.breadcrumbs).to.exist()
      expect(model.breadcrumbs).to.have.lengthOf(3)
      expect(model.breadcrumbs[0]).to.equal(menu[0])
      expect(model.breadcrumbs[1]).to.equal(itemB)
      expect(model.breadcrumbs[2]).to.equal(itemC)
    })

    it('should drop first breadcrumb item if nav tree has no title', () => {
      menu.push({
        order: 0,
        root: true,
        items: [
          {
            content: 'The Page',
            url: '/the-component/1.0/the-page.html',
            urlType: 'internal',
          },
        ],
      })
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.breadcrumbs).to.exist()
      expect(model.breadcrumbs).to.have.lengthOf(1)
      expect(model.breadcrumbs[0]).to.equal(menu[0].items[0])
    })

    it('should use breadcrumb path of first occurrence of page in nav tree', () => {
      let itemA
      let itemC1
      menu.push({
        order: 0,
        root: true,
        content: 'Nav Title',
        url: '/the-component/1.0/index.html',
        urlType: 'internal',
        items: [
          (itemA = {
            content: 'Page A',
            url: '/the-component/1.0/page-a.html',
            urlType: 'internal',
            items: [
              (itemC1 = {
                content: 'The Page',
                url: '/the-component/1.0/the-page.html',
                urlType: 'internal',
              }),
              {
                content: 'Page B',
                url: '/the-component/1.0/page-b.html',
                urlType: 'internal',
              },
            ],
          }),
          {
            content: 'The Page',
            url: '/the-component/1.0/the-page.html',
            urlType: 'internal',
          },
        ],
      })
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.breadcrumbs).to.exist()
      expect(model.breadcrumbs).to.have.lengthOf(3)
      expect(model.breadcrumbs[0]).to.equal(menu[0])
      expect(model.breadcrumbs[1]).to.equal(itemA)
      expect(model.breadcrumbs[2]).to.equal(itemC1)
    })

    it('should use breadcrumb path of first occurrence of page in any nav tree', () => {
      let itemC1
      menu.push({
        order: 0,
        root: true,
        content: 'First Nav Title',
        url: '/the-component/1.0/index.html',
        urlType: 'internal',
        items: [
          (itemC1 = {
            content: 'The Page',
            url: '/the-component/1.0/the-page.html',
            urlType: 'internal',
          }),
        ],
      })
      menu.push({
        order: 1,
        root: true,
        content: 'Second Nav Title',
        url: '/the-component/1.0/other.html',
        urlType: 'internal',
        items: [
          {
            content: 'The Page',
            url: '/the-component/1.0/the-page.html',
            urlType: 'internal',
          },
        ],
      })
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.breadcrumbs).to.exist()
      expect(model.breadcrumbs).to.have.lengthOf(2)
      expect(model.breadcrumbs[0]).to.equal(menu[0])
      expect(model.breadcrumbs[1]).to.equal(itemC1)
    })

    it('should not set versions property if component only has one version', () => {
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.versions).to.not.exist()
    })

    it('should set versions property based on versions of page from catalog', () => {
      component.url = '/the-component/2.0/index.html'
      component.versions.unshift({
        version: '2.0',
        title: 'The Component',
        url: '/the-component/2.0/index.html',
      })
      component.versions.push({
        version: '1.0-beta',
        title: 'The Component',
        url: '/the-component/1.0-beta/index.html',
      })
      const files = [
        {
          src: {
            path: 'modules/ROOT/pages/the-page.adoc',
            component: 'the-component',
            version: '1.0-beta',
            module: 'ROOT',
          },
          pub: {
            url: '/the-component/1.0-beta/the-page.html',
          },
        },
        file,
        {
          src: {
            path: 'modules/ROOT/pages/the-page.adoc',
            component: 'the-component',
            version: '2.0',
            module: 'ROOT',
          },
          pub: {
            url: '/the-component/2.0/the-page.html',
          },
        },
      ]
      contentCatalog.findBy = spy((filter) => files)
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expectCalledWith(contentCatalog.findBy, [
        {
          component: 'the-component',
          module: 'ROOT',
          family: 'page',
          relative: 'the-page.adoc',
        },
      ])
      expect(model.versions).to.exist()
      expect(model.versions).to.have.lengthOf(3)
      expect(model.versions).to.eql([
        { version: '2.0', url: '/the-component/2.0/the-page.html' },
        { version: '1.0', url: '/the-component/1.0/the-page.html' },
        { version: '1.0-beta', url: '/the-component/1.0-beta/the-page.html' },
      ])
    })

    it('should add sparse entry in value of versions property if page is missing for version', () => {
      component.url = '/the-component/2.0/index.html'
      component.versions.unshift({
        version: '2.0',
        title: 'The Component',
        url: '/the-component/2.0/index.html',
      })
      component.versions.push({
        version: '1.0-beta',
        title: 'The Component',
        url: '/the-component/1.0-beta/index.html',
      })
      const files = [
        file,
        {
          src: {
            path: 'modules/ROOT/pages/the-page.adoc',
            component: 'the-component',
            version: '2.0',
            module: 'ROOT',
          },
          pub: {
            url: '/the-component/2.0/the-page.html',
          },
        },
      ]
      contentCatalog.findBy = spy((filter) => files)
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expectCalledWith(contentCatalog.findBy, [
        {
          component: 'the-component',
          module: 'ROOT',
          family: 'page',
          relative: 'the-page.adoc',
        },
      ])
      expect(model.versions).to.exist()
      expect(model.versions).to.have.lengthOf(3)
      expect(model.versions).to.eql([
        { version: '2.0', url: '/the-component/2.0/the-page.html' },
        { version: '1.0', url: '/the-component/1.0/the-page.html' },
        { version: '1.0-beta', url: '/the-component/1.0-beta/index.html', missing: true },
      ])
    })

    it('should set canonicalUrl property to url of greatest version', () => {
      site.url = 'http://example.com'
      component.url = '/the-component/2.0/index.html'
      component.versions.unshift({
        version: '2.0',
        title: 'The Component',
        url: '/the-component/2.0/index.html',
      })
      const files = [
        file,
        {
          src: {
            path: 'modules/ROOT/pages/the-page.adoc',
            component: 'the-component',
            version: '2.0',
            module: 'ROOT',
          },
          pub: {
            url: '/the-component/2.0/the-page.html',
          },
        },
      ]
      contentCatalog.findBy = spy((filter) => files)
      const model = buildPageUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.canonicalUrl).to.exist()
      expect(model.canonicalUrl).to.equal('http://example.com/the-component/2.0/the-page.html')
    })
  })

  describe('buildUiModel()', () => {
    let site

    beforeEach(() => {
      site = {
        ui: {
          url: '/_',
        },
      }
    })

    it('should set site property to provided site model', () => {
      const model = buildUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.site).to.exist()
      expect(model.site).to.equal(site)
    })

    it('should compute and set page property', () => {
      const model = buildUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.page).to.exist()
      expect(model.page.url).to.equal(file.pub.url)
    })

    it('should set siteRootPath property to pub.rootPath of file', () => {
      const model = buildUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.siteRootPath).to.exist()
      expect(model.siteRootPath).to.equal(file.pub.rootPath)
    })

    it('should set uiRootPath property relative to page', () => {
      const model = buildUiModel(file, contentCatalog, navigationCatalog, site)
      expect(model.uiRootPath).to.exist()
      expect(model.uiRootPath).to.equal('../../_')
    })
  })
})
