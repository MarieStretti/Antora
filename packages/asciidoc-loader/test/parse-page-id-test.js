/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const parsePageId = require('@antora/asciidoc-loader/lib/xref/parse-page-id')

describe('parsePageId()', () => {
  it('should return undefined if input is not a valid page ID spec', () => {
    expect(parsePageId('the-component::')).to.be.undefined()
  })

  it('should parse a qualified page ID sans extension', () => {
    const input = '1.0@the-component:the-module:the-topic/the-page'
    const expected = {
      version: '1.0',
      component: 'the-component',
      module: 'the-module',
      family: 'page',
      relative: 'the-topic/the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should parse a qualified page ID with extension', () => {
    const input = '1.0@the-component:the-module:the-topic/the-page.adoc'
    const expected = {
      version: '1.0',
      component: 'the-component',
      module: 'the-module',
      family: 'page',
      relative: 'the-topic/the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should set version to master if component is specified but not version', () => {
    const input = 'the-component:the-module:the-page.adoc'
    const expected = {
      version: 'master',
      component: 'the-component',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should set module to ROOT if component is specified but not module', () => {
    const input = 'the-component::the-page.adoc'
    const expected = {
      component: 'the-component',
      version: 'master',
      module: 'ROOT',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should not set component, version, and module if only page is specified', () => {
    const input = 'the-page.adoc'
    const expected = {
      component: undefined,
      version: undefined,
      module: undefined,
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should not set component and version properties if only module and page are specified', () => {
    const input = 'the-module:the-page.adoc'
    const expected = {
      component: undefined,
      version: undefined,
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should not set component and module properties if only version and page are specified', () => {
    const input = '2.0@the-page.adoc'
    const expected = {
      component: undefined,
      version: '2.0',
      module: undefined,
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should not set component property if only version, module, and page are specified', () => {
    const input = '2.0@the-module:the-page.adoc'
    const expected = {
      component: undefined,
      version: '2.0',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parsePageId(input)
    expect(result).to.eql(expected)
  })

  it('should use values in context as defaults if provided', () => {
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
    }
    const result = parsePageId(inputSpec, inputCtx)
    expect(result).to.include(expected)
  })
})
