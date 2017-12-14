/* eslint-env mocha */
'use strict'

const { expect, spy } = require('../../../test/test-utils')
const resolvePageRef = require('@antora/document-converter/lib/resolve-page-ref')

describe('resolvePageRef', () => {
  function mockCatalogWithFile (file) {
    return {
      getById: spy(() => file),
    }
  }

  it('should throw error if page ID string has invalid syntax', () => {
    const catalog = mockCatalogWithFile()
    expect(() => resolvePageRef('component-foo::', catalog)).to.throw()
    expect(catalog.getById).to.not.have.been.called()
  })

  it('should return undefined page in result if file not found in catalog', () => {
    const catalog = mockCatalogWithFile()
    const targetPageIdStr = '1.2.3@the-component:the-module:the-page.adoc#the-fragment'
    const targetPageId = {
      component: 'the-component',
      version: '1.2.3',
      module: 'the-module',
      family: 'page',
      subpath: '',
      basename: 'the-page.adoc',
    }
    const result = resolvePageRef(targetPageIdStr, catalog)
    expect(catalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.deep.equal({ page: undefined, fragment: 'the-fragment' })
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
    const targetPageIdStr = '1.2.3@the-component:the-module:the-page.adoc#the-fragment'
    const targetPageId = {
      component: 'the-component',
      version: '1.2.3',
      module: 'the-module',
      family: 'page',
      subpath: '',
      basename: 'the-page.adoc',
    }
    const result = resolvePageRef(targetPageIdStr, catalog)
    expect(catalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.deep.equal({ page: targetFile, fragment: 'the-fragment' })
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
    const targetPageIdStr = 'target-page.adoc#the-fragment'
    const targetPageId = {
      component: 'current-component',
      version: '1.0',
      module: 'current-module',
      family: 'page',
      subpath: '',
      basename: 'target-page.adoc',
    }
    const result = resolvePageRef(targetPageIdStr, catalog, context)
    expect(catalog.getById).to.have.been.called.with(targetPageId)
    expect(result).to.deep.equal({ page: targetFile, fragment: 'the-fragment' })
  })
})
