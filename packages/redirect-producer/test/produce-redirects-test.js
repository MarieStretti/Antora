/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith } = require('../../../test/test-utils')

const produceRedirects = require('@antora/redirect-producer')
const mockContentCatalog = require('../../../test/mock-content-catalog')

describe('produceRedirects()', () => {
  let contentCatalog
  let playbook

  beforeEach(() => {
    playbook = {
      site: { url: 'https://docs.example.org' },
      urls: {},
    }
    contentCatalog = mockContentCatalog([
      { family: 'page', relative: 'the-target.adoc' },
      { family: 'alias', relative: 'alias-a.adoc' },
      { family: 'alias', module: 'module-b', relative: 'alias-b.adoc' },
      { family: 'alias', component: 'component-b', version: '1.0', module: 'ROOT', relative: 'alias-c.adoc' },
    ])
    const targetFile = contentCatalog.findBy({ family: 'page' })[0]
    contentCatalog.findBy({ family: 'alias' }).forEach((file) => (file.rel = targetFile))
  })

  it('should run on all files in the alias family', () => {
    const emptyContentCatalog = mockContentCatalog().spyOn('findBy')
    const result = produceRedirects(playbook, emptyContentCatalog)
    expect(result).to.have.lengthOf(0)
    expectCalledWith(emptyContentCatalog.findBy, { family: 'alias' })
  })

  describe('static facility', () => {
    beforeEach(() => {
      playbook.urls.redirectFacility = 'static'
    })

    it('should populate contents of files in alias family with static redirect page', () => {
      const result = produceRedirects(playbook, contentCatalog)
      expect(result).to.have.lengthOf(0)
      const expectedQualifiedUrl = 'https://docs.example.org/component-a/module-a/the-target.html'
      const expectedRelativeUrls = {
        'alias-a.adoc': 'the-target.html',
        'alias-b.adoc': '../module-a/the-target.html',
        'alias-c.adoc': '../../component-a/module-a/the-target.html',
      }
      contentCatalog.findBy({ family: 'alias' }).forEach((file) => {
        const expectedRelativeUrl = expectedRelativeUrls[file.src.relative]
        expect(file).to.have.property('contents')
        const html = file.contents.toString()
        expect(html).to.include(`<link rel="canonical" href="${expectedQualifiedUrl}">`)
        expect(html).to.include(`<script>location="${expectedRelativeUrl}"</script>`)
        expect(html).to.include(`<meta http-equiv="refresh" content="0; url=${expectedRelativeUrl}">`)
        expect(html).to.include(`<a href="${expectedRelativeUrl}">${expectedQualifiedUrl}</a>`)
      })
    })

    it('should not remove the out property on alias files', () => {
      produceRedirects(playbook, contentCatalog)
      contentCatalog.findBy({ family: 'alias' }).forEach((file) => {
        expect(file).to.have.property('out')
      })
    })

    it('should remove trailing / from value of site.url', () => {
      playbook.site.url = playbook.site.url + '/'
      produceRedirects(playbook, contentCatalog)
      const expectedQualifiedUrl = 'https://docs.example.org/component-a/module-a/the-target.html'
      contentCatalog.findBy({ family: 'alias' }).forEach((file) => {
        const html = file.contents.toString()
        expect(html).to.include(`<link rel="canonical" href="${expectedQualifiedUrl}">`)
      })
    })

    it('should not add canonical link element if site.url not specified in playbook', () => {
      delete playbook.site.url
      produceRedirects(playbook, contentCatalog)
      contentCatalog.findBy({ family: 'alias' }).forEach((file) => {
        const html = file.contents.toString()
        expect(html).to.not.include('<link rel="canonical"')
        expect(html).to.not.include('undefined')
      })
    })
  })

  describe('nginx facility', () => {
    beforeEach(() => {
      playbook.urls.redirectFacility = 'nginx'
    })

    it('should create and return nginx rewrite config file', () => {
      const result = produceRedirects(playbook, contentCatalog)
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.have.property('contents')
      expect(result[0]).to.have.property('out')
      expect(result[0].out.path).to.equal('.etc/nginx/rewrite.conf')
      const rules = result[0].contents
        .toString()
        .split('\n')
        .sort()
      expect(rules).to.eql([
        'location = /component-a/module-a/alias-a.html { return 301 /component-a/module-a/the-target.html; }',
        'location = /component-a/module-b/alias-b.html { return 301 /component-a/module-a/the-target.html; }',
        'location = /component-b/1.0/alias-c.html { return 301 /component-a/module-a/the-target.html; }',
      ])
    })

    it('should prefix each rewrite rule with URL context', () => {
      playbook.site.url = 'https://example.org/docs'
      const result = produceRedirects(playbook, contentCatalog)
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.have.property('contents')
      expect(result[0]).to.have.property('out')
      expect(result[0].out.path).to.equal('.etc/nginx/rewrite.conf')
      const rules = result[0].contents
        .toString()
        .split('\n')
        .sort()
      expect(rules).to.eql([
        'location = /docs/component-a/module-a/alias-a.html { return 301 /docs/component-a/module-a/the-target.html; }',
        'location = /docs/component-a/module-b/alias-b.html { return 301 /docs/component-a/module-a/the-target.html; }',
        'location = /docs/component-b/1.0/alias-c.html { return 301 /docs/component-a/module-a/the-target.html; }',
      ])
    })

    it('should not prefix rewrite rule with extra prefix if URL context is /', () => {
      playbook.site.url = playbook.site.url + '/'
      const result = produceRedirects(playbook, contentCatalog)
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.have.property('contents')
      expect(result[0]).to.have.property('out')
      expect(result[0].out.path).to.equal('.etc/nginx/rewrite.conf')
      const rules = result[0].contents
        .toString()
        .split('\n')
        .sort()
      expect(rules).to.eql([
        'location = /component-a/module-a/alias-a.html { return 301 /component-a/module-a/the-target.html; }',
        'location = /component-a/module-b/alias-b.html { return 301 /component-a/module-a/the-target.html; }',
        'location = /component-b/1.0/alias-c.html { return 301 /component-a/module-a/the-target.html; }',
      ])
    })

    it('should remove the out property on alias files', () => {
      produceRedirects(playbook, contentCatalog)
      contentCatalog.findBy({ family: 'alias' }).forEach((file) => {
        expect(file).to.not.have.property('out')
      })
    })
  })

  describe('disabled facility', () => {
    beforeEach(() => {
      playbook.urls.redirectFacility = 'disabled'
    })

    it('should remove out property from files in alias family', () => {
      const result = produceRedirects(playbook, contentCatalog)
      expect(result).to.have.lengthOf(0)
      contentCatalog.findBy({ family: 'alias' }).forEach((file) => {
        expect(file).to.not.have.property('out')
      })
    })
  })

  /*
TESTS:
- includes context path in nginx redirect rule

QUESTION should function return a single virtual file instead of multiple?
*/
})
