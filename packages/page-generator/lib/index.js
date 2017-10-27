'use strict'

const Buffer = require('buffer').Buffer

const _ = require('lodash')
const handlebars = require('handlebars')
const requireFromString = require('require-from-string')

const compileOptions = { preventIndent: true }

module.exports = async (helpers, layouts, partials) => {
  helpers.forEach((file) => {
    const helperFunction = requireFromString(file.contents.toString())
    handlebars.registerHelper(file.stem, helperFunction)
  })

  const compiledLayouts = {}
  layouts.forEach((file) => {
    const layout = file.contents.toString()
    compiledLayouts[file.stem] = handlebars.compile(layout, compileOptions)
  })

  partials.forEach((file) => {
    handlebars.registerPartial(file.stem, file.contents.toString())
  })

  return (page, playbook, vfileCatalog) => {

    const defaultLayout = _.get(playbook, 'ui.defaultLayout', 'default')
    const pageLayout = _.get(page, 'asciidoc.attributes.page-layout', defaultLayout)
    const compiledLayout = compiledLayouts[pageLayout]

    if (!compiledLayout) {
      throw new Error(`Template ${pageLayout} could not be found in`, compiledLayouts)
    }

    const model = {
      site: {
        url: _.get(playbook, 'site.url'),
        title: _.get(playbook, 'site.title'),
        // domains: vfileCatalog.getDomainVersionIndex(),
      },
      title: _.get(page, 'asciidoc.attributes.page-title'),
      contents: page.contents.toString(),
      description: page.asciidoc.attributes.description,
      keywords: page.asciidoc.attributes.keywords,
      domain: {
        name: page.src.component,
        versioned: page.src.version !== 'master',
        //   url,
        //   root,
        version: {
          string: page.src.version,
          // url
        },
        // versions: vfileCatalog.getVersionsIndex(page.src.component),
      },
      // versions,
      canonicalUrl: page.pub.canonicalUrl,
      // editUrl,
      // uiRootPath,
      // siteRootUrl,
      // home,
    }

    const newContents = Buffer.from(compiledLayout(model))

    page.contents = newContents
  }
}

