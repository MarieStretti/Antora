/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const { DOMParser } = require('xmldom')
const mapSite = require('@antora/site-mapper')
const mockContentCatalog = require('../../../test/mock-content-catalog')

describe('mapSite()', () => {
  let playbook

  const collectUrls = (doc, tagName = 'url') =>
    Array.from(doc.documentElement.getElementsByTagName(tagName)).map(
      (node) => node.getElementsByTagName('loc').item(0).textContent
    )

  const validateXml = (xml) => {
    const errors = []
    const parser = new DOMParser({
      errorHandler: (_, message) => errors.push(message),
    })
    parser.parseFromString(xml)
    return errors
  }

  beforeEach(() => {
    playbook = {
      site: { url: 'https://docs.example.org' },
    }
  })

  it('should not generate sitemaps if pages is empty', () => {
    expect(mapSite(playbook, [])).to.be.empty()
  })

  it('should not generate sitemaps if site URL is not set', () => {
    delete playbook.site.url
    const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.be.empty()
  })

  it('should not generate sitemaps if site URL is /', () => {
    playbook.site.url = '/'
    const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.be.empty()
  })

  it('should not generate sitemaps if site URL is a pathname', () => {
    playbook.site.url = '/docs'
    const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.be.empty()
  })

  it('should generate single sitemap at root of site for a site with a single component', () => {
    const contentCatalog = mockContentCatalog([
      { family: 'page', relative: 'index.adoc' },
      { family: 'page', relative: 'quickstart.adoc' },
      { family: 'page', relative: 'features.adoc' },
    ])
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.have.lengthOf(1)
    const sitemapIndex = sitemaps[0]
    expect(sitemapIndex.out).to.eql({ path: 'sitemap.xml' })
    expect(sitemapIndex.pub).to.eql({ url: '/sitemap.xml' })
    expect(sitemapIndex.contents.toString()).to.include('<urlset ')
    expect(sitemapIndex.contents.toString()).to.endWith('\n')
  })

  it('should generate multiple sitemaps with index at root of site if site contains multiple components', () => {
    const contentCatalog = mockContentCatalog([
      { component: 'component-a', family: 'page', relative: 'index.adoc' },
      { component: 'component-b', family: 'page', relative: 'index.adoc' },
    ])
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.have.lengthOf(3)
    const paths = sitemaps.map((sitemap) => sitemap.out.path)
    expect(paths).to.have.members(['sitemap.xml', 'sitemap-component-a.xml', 'sitemap-component-b.xml'])
    const sitemapIndex = sitemaps.find((sitemap) => sitemap.out.path === 'sitemap.xml')
    expect(sitemapIndex.out).to.eql({ path: 'sitemap.xml' })
    expect(sitemapIndex.pub).to.eql({ url: '/sitemap.xml' })
    expect(sitemapIndex.contents.toString()).to.include('<sitemapindex ')
    expect(sitemapIndex.contents.toString()).to.endWith('\n')
    const componentSitemap = sitemaps.find((sitemap) => sitemap.out.path !== 'sitemap.xml')
    expect(componentSitemap.contents.toString()).to.include('<urlset ')
  })

  it('should trim trailing slash from site url', () => {
    const contentCatalog = mockContentCatalog({ family: 'page', module: 'ROOT', relative: 'index.adoc' })
    playbook.site.url = playbook.site.url + '/'
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps[0].contents.toString()).to.include('<loc>https://docs.example.org/component-a/index.html</loc>')
  })

  it('should generate sitemaps containing valid XML', () => {
    const contentCatalog = mockContentCatalog([
      { component: 'component-a', family: 'page', relative: 'index.adoc' },
      { component: 'component-a', family: 'page', relative: 'admin/console.adoc' },
      { component: 'component-b', family: 'page', relative: 'index.adoc' },
      { component: 'component-b', family: 'page', relative: 'commands/generate.adoc' },
    ])
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.have.lengthOf(3)
    sitemaps.forEach((sitemap) => {
      expect(validateXml(sitemap.contents.toString())).to.be.empty()
    })
  })

  it('should sort entries in sitemap by version, then by URL path', () => {
    const contentCatalog = mockContentCatalog([
      { component: 'component-a', version: '1.0', family: 'page', relative: 'index.adoc' },
      { component: 'component-a', version: '1.0', family: 'page', relative: 'z.adoc' },
      { component: 'component-a', version: '1.0', family: 'page', relative: 'a.adoc' },
      { component: 'component-a', version: '1.0', family: 'page', relative: 'clients/ruby.adoc' },
      { component: 'component-a', version: '1.0', family: 'page', relative: 'clients/java.adoc' },
      { component: 'component-a', version: '1.0', family: 'page', relative: 'clients/c.adoc' },
      { component: 'component-a', version: '1.0', family: 'page', module: 'admin', relative: 'console.adoc' },
      { component: 'component-a', version: '2.0', family: 'page', relative: 'index.adoc' },
      { component: 'component-a', version: '2.0', family: 'page', relative: 'y.adoc' },
      { component: 'component-a', version: '2.0', family: 'page', relative: 'b.adoc' },
      { component: 'component-b', family: 'page', relative: 'index.adoc' },
    ])
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    const sitemapA = sitemaps.find((sitemap) => sitemap.out.path === 'sitemap-component-a.xml')
    const urls = collectUrls(new DOMParser().parseFromString(sitemapA.contents.toString()))
    const urlsExpected = [
      'https://docs.example.org/component-a/2.0/module-a/b.html',
      'https://docs.example.org/component-a/2.0/module-a/index.html',
      'https://docs.example.org/component-a/2.0/module-a/y.html',
      'https://docs.example.org/component-a/1.0/admin/console.html',
      'https://docs.example.org/component-a/1.0/module-a/a.html',
      'https://docs.example.org/component-a/1.0/module-a/clients/c.html',
      'https://docs.example.org/component-a/1.0/module-a/clients/java.html',
      'https://docs.example.org/component-a/1.0/module-a/clients/ruby.html',
      'https://docs.example.org/component-a/1.0/module-a/index.html',
      'https://docs.example.org/component-a/1.0/module-a/z.html',
    ]
    expect(urls).to.have.ordered.members(urlsExpected)
  })

  it('should sort entries in sitemap index by component name', () => {
    const contentCatalog = mockContentCatalog([
      { component: 'vinyl', family: 'page', relative: 'index.adoc' },
      { component: 'babel', family: 'page', relative: 'index.adoc' },
      { component: 'commander', family: 'page', relative: 'index.adoc' },
      { component: 'antora', family: 'page', relative: 'index.adoc' },
    ])
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    const sitemapIndex = sitemaps.find((sitemap) => sitemap.out.path === 'sitemap.xml')
    const urls = collectUrls(new DOMParser().parseFromString(sitemapIndex.contents.toString()), 'sitemap')
    const urlsExpected = [
      'https://docs.example.org/sitemap-antora.xml',
      'https://docs.example.org/sitemap-babel.xml',
      'https://docs.example.org/sitemap-commander.xml',
      'https://docs.example.org/sitemap-vinyl.xml',
    ]
    expect(urls).to.have.ordered.members(urlsExpected)
  })

  it('should escape URLs that contain special characters', () => {
    const contentCatalog = mockContentCatalog([
      { component: 'the-component', family: 'page', relative: 'setup&go.adoc' },
      { component: 'the-component', family: 'page', relative: 'reverting-1<2.adoc' },
    ])
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    const sitemapXml = sitemaps[0].contents.toString()
    expect(validateXml(sitemapXml)).to.be.empty()
    expect(sitemapXml).to.include('setup&amp;go')
    expect(sitemapXml).to.include('reverting-1&lt;2')
  })

  it('should generate robots.txt that allows all if value of site.robots is "allow"', () => {
    playbook.site.robots = 'allow'
    const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.have.lengthOf(2)
    const robotstxt = sitemaps.find((sitemap) => sitemap.out.path === 'robots.txt')
    expect(robotstxt).not.to.be.undefined()
    expect(robotstxt.contents.toString()).to.equal(`User-agent: *
Allow: /
`)
  })

  it('should generate robots.txt that disallows all if value of site.robots is "disallow"', () => {
    playbook.site.robots = 'disallow'
    const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    expect(sitemaps).to.have.lengthOf(2)
    const robotstxt = sitemaps.find((sitemap) => sitemap.out.path === 'robots.txt')
    expect(robotstxt).not.to.be.undefined()
    expect(robotstxt.contents.toString()).to.equal(`User-agent: *
Disallow: /
`)
  })

  it('should generate specified robots.txt if value of site.robots is a custom string', () => {
    playbook.site.robots = `User-agent: *
Disallow: /secret-component/`
    const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
    const sitemaps = mapSite(playbook, contentCatalog.getPages())
    const robotstxt = sitemaps.find((sitemap) => sitemap.out.path === 'robots.txt')
    expect(robotstxt).not.to.be.undefined()
    expect(robotstxt.contents.toString()).to.equal(`User-agent: *
Disallow: /secret-component/
`)
  })

  it('should not generate robots.txt if value of site.robots is falsy', () => {
    ;[null, undefined, false, ''].forEach((robots) => {
      playbook.site.robots = robots
      const contentCatalog = mockContentCatalog({ family: 'page', relative: 'index.adoc' })
      const sitemaps = mapSite(playbook, contentCatalog.getPages())
      const robotstxt = sitemaps.find((sitemap) => sitemap.out.path === 'robots.txt')
      expect(robotstxt).to.be.undefined()
    })
  })
})
