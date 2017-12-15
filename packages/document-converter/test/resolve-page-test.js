/* eslint-env mocha */
'use strict'

const { expect, spy } = require('../../../test/test-utils')
const resolvePage = require('@antora/document-converter/lib/resolve-page')

describe('resolvePage', () => {
  function mockCatalogWithFile (file) {
    return {
      getById: spy(() => file),
    }
  }

  it('should throw error if page ID string has invalid syntax', () => {
    const catalog = mockCatalogWithFile()
    expect(() => resolvePage('component-foo::', catalog)).to.throw()
    expect(catalog.getById).to.not.have.been.called()
  })

  it('should return undefined page in result if file not found in catalog', () => {
    const catalog = mockCatalogWithFile()
    const targetPageIdSpec = '1.2.3@the-component:the-module:the-page.adoc'
    const targetPageId = {
      component: 'the-component',
      version: '1.2.3',
      module: 'the-module',
      family: 'page',
      subpath: '',
      basename: 'the-page.adoc',
    }
    const result = resolvePage(targetPageIdSpec, catalog)
    expect(catalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.be.undefined()
  })

  it('should resolve qualified page ID string to file in catalog', () => {
    const targetFile = {
      src: {
        component: 'the-component',
        version: '1.2.3',
        module: 'the-module',
        family: 'page',
        subpath: '',
        stem: 'the-page',
        basename: 'the-page.adoc',
        extname: '.adoc',
      },
    }
    const catalog = mockCatalogWithFile(targetFile)
    const targetPageIdSpec = '1.2.3@the-component:the-module:the-page.adoc'
    const targetPageId = {
      component: 'the-component',
      version: '1.2.3',
      module: 'the-module',
      family: 'page',
      subpath: '',
      basename: 'the-page.adoc',
    }
    const result = resolvePage(targetPageIdSpec, catalog)
    expect(catalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.equal(targetFile)
  })

  it('should use context to fill out page ID when resolving file in catalog', () => {
    const context = {
      component: 'current-component',
      version: '1.0',
      module: 'current-module',
      family: 'page',
      subpath: '',
      stem: 'current-page',
      basename: 'current-page.adoc',
      extname: '.adoc',
    }
    const targetFile = {
      src: {
        component: 'current-component',
        version: '1.0',
        module: 'current-module',
        family: 'page',
        subpath: '',
        stem: 'target-page',
        basename: 'target-page.adoc',
        extname: '.adoc',
      },
    }
    const catalog = mockCatalogWithFile(targetFile)
    const targetPageIdSpec = 'target-page.adoc'
    const targetPageId = {
      component: 'current-component',
      version: '1.0',
      module: 'current-module',
      family: 'page',
      subpath: '',
      basename: 'target-page.adoc',
    }
    const result = resolvePage(targetPageIdSpec, catalog, context)
    expect(catalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.equal(targetFile)
  })
})
