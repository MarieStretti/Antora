/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const parseResourceId = require('@antora/content-classifier/lib/util/parse-resource-id')

describe('parseResourceId()', () => {
  it('should return undefined if input is not a valid resource ID spec', () => {
    expect(parseResourceId('invalid-syntax::')).to.be.undefined()
  })

  it('should parse a qualified resource ID', () => {
    const input = '1.0@the-component:the-module:example$ruby/hello.rb'
    const expected = {
      version: '1.0',
      component: 'the-component',
      module: 'the-module',
      family: 'example',
      relative: 'ruby/hello.rb',
    }
    const result = parseResourceId(input)
    expect(result).to.eql(expected)
  })

  it('should parse a qualified page ID with file extension', () => {
    const input = '1.0@the-component:the-module:the-topic/the-page.adoc'
    const expected = {
      version: '1.0',
      component: 'the-component',
      module: 'the-module',
      family: 'page',
      relative: 'the-topic/the-page.adoc',
    }
    const result = parseResourceId(input)
    expect(result).to.eql(expected)
  })

  it('should parse a qualified page ID sans file extension', () => {
    const input = '1.0@the-component:the-module:the-topic/the-page'
    const expected = {
      version: '1.0',
      component: 'the-component',
      module: 'the-module',
      family: 'page',
      relative: 'the-topic/the-page.adoc',
    }
    const result = parseResourceId(input)
    expect(result).to.eql(expected)
  })

  it('should leave version undefined if component is specified but not version', () => {
    const input = 'the-component:the-module:the-page.adoc'
    const inputCtx = { version: '1.0' }
    const expected = {
      version: undefined,
      component: 'the-component',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(input, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should set module to ROOT if component is specified but not module', () => {
    const input = '1.0@the-component::the-page.adoc'
    const expected = {
      component: 'the-component',
      version: '1.0',
      module: 'ROOT',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(input)
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
    const result = parseResourceId(input)
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
    const result = parseResourceId(input)
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
    const result = parseResourceId(input)
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
    const result = parseResourceId(input)
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
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should not replace specified values with values in context', () => {
    const inputSpec = '1.0@the-component:the-module:the-page.adoc'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'the-component',
      version: '1.0',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should not use values in context if component is specified', () => {
    const inputSpec = 'the-component::the-page.adoc'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'the-component',
      version: undefined,
      module: 'ROOT',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should set family to page by default', () => {
    const result = parseResourceId('the-page.adoc')
    expect(result.family).to.equal('page')
  })

  it('should parse resource ID with family and relative path', () => {
    const inputSpec = 'partial$the-page.adoc'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
      family: 'partial',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should parse resource ID with module, family, and relative path', () => {
    const inputSpec = 'the-module:partial$the-page.adoc'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'ctx-component',
      version: '1.1',
      module: 'the-module',
      family: 'partial',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should parse resource ID with component, module, family, and relative path', () => {
    const inputSpec = 'the-component:the-module:example$hello.rb'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'the-component',
      version: undefined,
      module: 'the-module',
      family: 'example',
      relative: 'hello.rb',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should allow any family by default', () => {
    const inputSpec = 'the-module:example$config.yml'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'ctx-component',
      version: '1.1',
      module: 'the-module',
      family: 'example',
      relative: 'config.yml',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should leave family undefined if spec does not reference permitted family', () => {
    const inputSpec = 'image$dialog.png'
    expect(parseResourceId(inputSpec, undefined, ['page', 'partial', 'example']).family).to.be.undefined()
  })

  it('should not use family from context if family not specified in ID', () => {
    const inputSpec = 'the-module:the-page.adoc'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
      family: 'image',
    }
    const expected = {
      component: 'ctx-component',
      version: '1.1',
      module: 'the-module',
      family: 'page',
      relative: 'the-page.adoc',
    }
    const result = parseResourceId(inputSpec, inputCtx)
    expect(result).to.eql(expected)
  })

  it('should use default family if family not defined in spec', () => {
    const inputSpec = 'the-module:dialog.png'
    const inputCtx = {
      component: 'ctx-component',
      version: '1.1',
      module: 'ctx-module',
    }
    const expected = {
      component: 'ctx-component',
      version: '1.1',
      module: 'the-module',
      family: 'image',
      relative: 'dialog.png',
    }
    const result = parseResourceId(inputSpec, inputCtx, ['image'], 'image')
    expect(result).to.eql(expected)
  })

  it('should not set family if default family is null and family not specified in spec', () => {
    const inputSpec = 'the-module:dialog.png'
    const result = parseResourceId(inputSpec, undefined, undefined, null)
    expect(result.family).to.not.exist()
  })
})
