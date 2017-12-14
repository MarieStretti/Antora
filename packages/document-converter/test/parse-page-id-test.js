/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')
const parsePageId = require('@antora/document-converter/lib/parse-page-id')

describe('parsePageId()', () => {
  it('should return undefined if input does not match page ID syntax', () => {
    expect(parsePageId('the-component::')).to.be.undefined()
  })

  it('should extract all coordinates of qualified page ID', () => {
    const input = '1.0@the-component:the-module:the-topic/the-page.adoc#the-fragment'
    const expected = {
      version: '1.0',
      component: 'the-component',
      module: 'the-module',
      subpath: 'the-topic',
      stem: 'the-page',
      fragment: 'the-fragment',
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should set version to master if component is specified but not version', () => {
    const input = 'the-component:the-module:the-page.adoc'
    const expected = {
      version: 'master',
      component: 'the-component',
      module: 'the-module',
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should set module to ROOT if component is specified but not module', () => {
    const input = 'the-component::the-page.adoc'
    const expected = {
      component: 'the-component',
      module: 'ROOT',
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should set subpath to blank if page is not in a topic folder', () => {
    const input = 'the-component:the-module:the-page.adoc'
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result.subpath).to.equal('')
  })

  it('should only define page-related properties if only page is specified', () => {
    const input = 'the-page.adoc'
    const expected = {
      component: undefined,
      version: undefined,
      module: undefined,
      subpath: '',
      stem: 'the-page',
      family: 'page',
      mediaType: 'text/asciidoc',
      extname: '.adoc',
      basename: 'the-page.adoc',
      fragment: undefined,
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should not define component and version properties if only module and page are specified', () => {
    const input = 'the-module:the-page.adoc'
    const expected = {
      component: undefined,
      version: undefined,
      module: 'the-module',
      stem: 'the-page',
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should not define component and module properties if only version and page are specified', () => {
    const input = '2.0@the-page.adoc'
    const expected = {
      component: undefined,
      version: '2.0',
      module: undefined,
      stem: 'the-page',
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should not define component property if only version, module, and page are specified', () => {
    const input = '2.0@the-module:the-page.adoc'
    const expected = {
      component: undefined,
      version: '2.0',
      module: 'the-module',
      stem: 'the-page',
    }
    const result = parsePageId(input)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })

  it('should fall back to value in context if provided', () => {
    const inputSpec = 'the-page.adoc'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
      stem: 'the-page',
    }
    const result = parsePageId(inputSpec, inputCtx)
    expect(result).to.not.be.undefined()
    expect(result).to.include(expected)
  })
})
