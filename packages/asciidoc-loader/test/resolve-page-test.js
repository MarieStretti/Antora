/* eslint-env mocha */
'use strict'

const { expect, spy } = require('../../../test/test-utils')

const resolvePage = require('@antora/asciidoc-loader/lib/xref/resolve-page')

describe('resolvePage', () => {
  const mockContentCatalog = (file) => ({ getById: spy(() => file) })

  it('should throw error if page ID spec has invalid syntax', () => {
    const contentCatalog = mockContentCatalog()
    expect(() => resolvePage('component-foo::', contentCatalog)).to.throw()
    expect(contentCatalog.getById).to.not.have.been.called()
  })

  it('should return undefined page in result if file not found in catalog', () => {
    const contentCatalog = mockContentCatalog()
    const targetPageIdSpec = '1.2.3@the-component:the-module:the-page.adoc'
    const targetPageId = {
      component: 'the-component',
      version: '1.2.3',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = resolvePage(targetPageIdSpec, contentCatalog)
    expect(contentCatalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.be.undefined()
  })

  it('should resolve qualified page ID spec to file in catalog', () => {
    const targetFile = {
      src: {
        component: 'the-component',
        version: '1.2.3',
        module: 'the-module',
        family: 'page',
        relative: 'the-page.adoc',
      },
    }
    const contentCatalog = mockContentCatalog(targetFile)
    const targetPageIdSpec = '1.2.3@the-component:the-module:the-page.adoc'
    const targetPageId = {
      component: 'the-component',
      version: '1.2.3',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = resolvePage(targetPageIdSpec, contentCatalog)
    expect(contentCatalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.equal(targetFile)
  })

  it('should use context to fill out page ID when resolving file in catalog', () => {
    const context = {
      component: 'current-component',
      version: '1.0',
      module: 'current-module',
      family: 'page',
      relative: 'current-page.adoc',
    }
    const targetFile = {
      src: {
        component: 'current-component',
        version: '1.0',
        module: 'current-module',
        family: 'page',
        relative: 'target-page.adoc',
      },
    }
    const contentCatalog = mockContentCatalog(targetFile)
    const targetPageIdSpec = 'target-page.adoc'
    const targetPageId = {
      component: 'current-component',
      version: '1.0',
      module: 'current-module',
      family: 'page',
      relative: 'target-page.adoc',
    }
    const result = resolvePage(targetPageIdSpec, contentCatalog, context)
    expect(contentCatalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.equal(targetFile)
  })
})
