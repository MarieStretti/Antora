/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')
const processTemplatingFiles = require('../lib/index')

describe('processTemplatingFiles().generatePage()', () => {
  let helpers
  let layouts
  let partials
  let page
  let playbook

  beforeEach(() => {
    helpers = [{
      stem: 'upper',
      contents: Buffer.from('module.exports = (str) => str.toUpperCase()'),
    }]
    layouts = [
      {
        stem: 'default',
        contents: Buffer.from('<!--DEFAULT--><html>{{>head}}{{>body}}</html>'),
      },
      {
        stem: 'one',
        contents: Buffer.from('<!--ONE--><html>{{>head}}{{>body}}</html>'),
      },
      {
        stem: 'two',
        contents: Buffer.from('<!--TWO--><html>{{>head}}{{>body}}</html>'),
      },
    ]
    partials = [
      {
        stem: 'head',
        contents: Buffer.from('<title>{{title}}</title>'),
      },
      {
        stem: 'body',
        contents: Buffer.from('<h1>{{upper title}}</h1>{{{contents}}}'),
      },
    ]
    playbook = {
      site: {
        url: 'http://the-site.com',
        title: 'The Site!',
      },
      ui: { defaultLayout: 'one' },
    }
    page = {
      contents: Buffer.from('<h2>Bonjour</h2>'),
      src: {
        component: 'the-component',
        version: 'v1.2.3',
      },
      pub: {
        absoluteUrl: 'http://the-site.com/the-component/v1.2.3/hello-world.html',
        canonicalUrl: 'http://the-site.com/the-component/hello-world.html',
      },
      asciidoc: {
        attributes: {
          'page-title': 'Hello World!',
          description: 'the description',
          keywords: 'foo,bar,baz',
        },
      },
    }
  })

  it('should generate a page with "default" layout by default', async () => {
    const generatePage = await processTemplatingFiles(helpers, layouts, partials)
    delete playbook.ui.defaultLayout
    generatePage(page, playbook)
    return expect(page.contents.toString()).to.eql('<!--DEFAULT--><html><title>Hello World!</title><h1>HELLO WORLD!</h1><h2>Bonjour</h2></html>')
  })

  it('should generate a page with layout specified by playbook.ui.defaultLayout', async () => {
    const generatePage = await processTemplatingFiles(helpers, layouts, partials)
    generatePage(page, playbook)
    return expect(page.contents.toString()).to.eql('<!--ONE--><html><title>Hello World!</title><h1>HELLO WORLD!</h1><h2>Bonjour</h2></html>')
  })

  it('should generate a page with layout specified by page.asciidoc.attributes.page-layout', async () => {
    const generatePage = await processTemplatingFiles(helpers, layouts, partials)
    page.asciidoc.attributes['page-layout'] = 'two'
    generatePage(page, playbook)
    return expect(page.contents.toString()).to.eql('<!--TWO--><html><title>Hello World!</title><h1>HELLO WORLD!</h1><h2>Bonjour</h2></html>')
  })

  it('should generate a page with all the necessary variables', async () => {
    layouts.push({
      stem: 'all-variables',
      contents: Buffer.from([
        '{{site.url}}',
        '{{site.title}}',
        '{{title}}',
        '{{description}}',
        '{{keywords}}',
        '{{domain.name}}',
        '{{domain.versioned}}',
        '{{domain.version.string}}',
        '{{canonicalUrl}}',
      ].join('\n')),
    })
    const generatePage = await processTemplatingFiles(helpers, layouts, partials)
    page.asciidoc.attributes['page-layout'] = 'all-variables'
    generatePage(page, playbook)
    return expect(page.contents.toString()).to.eql([
      'http://the-site.com',
      'The Site!',
      'Hello World!',
      'the description',
      'foo,bar,baz',
      'the-component',
      'true',
      'v1.2.3',
      'http://the-site.com/the-component/hello-world.html',
    ].join('\n'))
  })
})

// test failures
// * missing layouts
// * missing helpers
// * missing partials
