'use strict'

const hbs = require('handlebars')
const path = require('path')
const requireFromString = require('require-from-string')
const versionCompare = require('@antora/content-classifier/lib/util/version-compare-desc')

// TODO move to constants
const compileOptions = { preventIndent: true }

// TODO this method could prepare the shared model
module.exports = (uiCatalog) => {
  uiCatalog.findByType('helper').forEach((file) =>
    hbs.registerHelper(file.stem, requireFromString(file.contents.toString(), file.path))
  )

  uiCatalog.findByType('partial').forEach((file) => hbs.registerPartial(file.stem, file.contents.toString()))

  const compiledLayouts = uiCatalog.findByType('layout').reduce((accum, file) => {
    accum[file.stem] = hbs.compile(file.contents.toString(), compileOptions)
    return accum
  }, {})

  return (page, playbook, contentCatalog, navigationCatalog) => {
    let siteUrl = playbook.site.url
    if (siteUrl && siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
    const uiConfig = playbook.ui || {}
    let uiRootPath = path.join(page.pub.rootPath, uiConfig.outputDir)
    if (uiRootPath.charAt(uiRootPath.length - 1) === '/') uiRootPath = uiRootPath.substr(0, uiRootPath.length - 1)
    const attrs = page.asciidoc.attributes
    const pageLayout = attrs['page-layout'] || uiConfig.defaultLayout || 'default'
    const compiledLayout = compiledLayouts[pageLayout]

    // FIXME warn, but fall back to default layout
    if (!compiledLayout) {
      throw new Error(`Template ${pageLayout} could not be found in`, compiledLayouts)
    }

    const components = contentCatalog.getComponents()
    components.sort((a, b) => a.title.localeCompare(b.title))

    const component = contentCatalog.getComponent(page.src.component)

    const navigation = navigationCatalog.getMenu(page.src.component, page.src.version)

    const breadcrumbs = getBreadcrumbs(page.pub.url, navigation)

    const versions = component.versions.length > 1 ? getPageVersions(page.src, contentCatalog, { sparse: true }) : undefined

    if (siteUrl) page.pub.canonicalUrl = siteUrl + (versions ? versions[0].url : page.pub.url)

    const model = {
      site: {
        title: playbook.site.title,
        url: siteUrl,
        keys: playbook.site.keys,
        components,
      },
      title: attrs.doctitle, // FIXME this should be page.asciidoc.doctitle (not the same)
      url: page.pub.url, // rename to currentUrl?
      //version: page.src.version,
      contents: page.contents,
      description: attrs.description,
      keywords: attrs.keywords,
      // FIXME use component instead of reconstructing
      component: {
        name: component.name,
        title: component.title,
        // FIXME versioned should be whether versions for page is > 1
        versioned: page.src.version !== 'master',
        url: component.url,
        // NOTE root will be added later once we have a root component
        root: false,
        // Q: should this be version: { version: ..., url: ... }?
        version: page.src.version,
        versions: component.versions,
      },
      breadcrumbs,
      navigation,
      versions,
      canonicalUrl: page.pub.canonicalUrl,
      //editUrl: page.pub.editUrl,
      uiRootPath,
      siteRootPath: page.pub.rootPath,
      // siteRootUrl should only be set if there's a start/home page for the site
      //siteRootUrl
      // FIXME this should be precomputed as page.pub.home; not necessarily root index page
      // TODO also map start (or startPage)
      // NOTE we won't have a home until we have a root (and/or start) component
      home: false,
    }

    page.contents = Buffer.from(compiledLayout(model))
  }
}

function getBreadcrumbs (matchUrl, menu) {
  for (let i = 0, numTrees = menu.length; i < numTrees; i++) {
    const breadcrumbs = findBreadcrumbPath(matchUrl, menu[i])
    if (breadcrumbs) return breadcrumbs
  }
  return []
}

function findBreadcrumbPath (matchUrl, currentItem, currentPath = []) {
  if (currentItem.url === matchUrl && currentItem.urlType === 'internal') return currentPath.concat(currentItem)
  const items = currentItem.items
  let numItems
  if (items && (numItems = items.length)) {
    for (let i = 0; i < numItems; i++) {
      const matchingPath = findBreadcrumbPath(
        matchUrl,
        items[i],
        currentItem.content ? currentPath.concat(currentItem) : currentPath
      )
      if (matchingPath) return matchingPath
    }
  }
}

// QUESTION should this go in ContentCatalog?
function getPageVersions (currentPageSrc, contentCatalog, opts = {}) {
  const versionlessPageId = {
    component: currentPageSrc.component,
    module: currentPageSrc.module,
    family: 'page',
    relative: currentPageSrc.relative,
  }
  if (opts.sparse) {
    const component = contentCatalog.getComponent(currentPageSrc.component)
    if (component.versions.length > 1) {
      let pageVersions = contentCatalog
        .findBy(versionlessPageId)
        .reduce((accum, page) => {
          accum[page.src.version] = { version: page.src.version, url: page.pub.url }
          return accum
        }, {})

      return component.versions.map(({ version, url }) =>
        (version in pageVersions) ? pageVersions[version] : { version, url, missing: true }
      ).sort((a, b) => versionCompare(a.version, b.version))
    }
  } else if (pages.length > 1) {
    return contentCatalog
      .findBy(versionlessPageId)
      .map((page) => ({ version: page.src.version, url: page.pub.url, }))
      .sort((a, b) => versionCompare(a.version, b.version))
  }
}
