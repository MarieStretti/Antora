'use strict'

const handlebars = require('handlebars')
const requireFromString = require('require-from-string')

// TODO move to constants
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

  return (page, playbook, contentCatalog) => {
    const attrs = page.asciidoc.attributes
    const uiConfig = playbook.ui || {}
    const pageLayout = attrs['page-layout'] || uiConfig.defaultLayout || 'default'
    const compiledLayout = compiledLayouts[pageLayout]

    if (!compiledLayout) {
      throw new Error(`Template ${pageLayout} could not be found in`, compiledLayouts)
    }

    const model = {
      site: {
        url: playbook.site.url,
        title: playbook.site.title,
        // domains: contentCatalog.getDomainVersionIndex(),
      },
      // FIXME this should be page.asciidoc.doctitle (not the same)
      title: attrs.doctitle,
      contents: page.contents.toString(),
      description: attrs.description,
      keywords: attrs.keywords,
      domain: {
        name: page.src.component,
        versioned: page.src.version !== 'master',
        //   url,
        //   root,
        version: {
          string: page.src.version,
          // url
        },
        // versions: contentCatalog.getVersionsIndex(page.src.component),
      },
      // versions,
      canonicalUrl: page.pub.canonicalUrl,
      // editUrl,
      // uiRootPath,
      // siteRootUrl,
      // home,
    }

    page.contents = Buffer.from(compiledLayout(model))
  }
}
