'use strict'

const ContentCatalog = require('./content-catalog')

const { START_PAGE_ID } = require('./constants')

/**
 * Organizes the raw aggregate of virtual files into a {ContentCatalog}.
 *
 * @memberof content-classifier
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.site - Site-related configuration data.
 * @param {String} playbook.site.startPage - The start page for the site; redirects from base URL.
 * @param {Object} playbook.urls - URL settings for the site.
 * @param {String} playbook.urls.htmlExtensionStyle - The style to use when computing page URLs.
 * @param {Object} aggregate - The raw aggregate of virtual file objects to be classified.
 * @param {Object} [siteAsciiDocConfig=undefined] - Site-wide AsciiDoc processor configuration options.
 * @returns {ContentCatalog} A structured catalog of content components and virtual content files.
 */
function classifyContent (playbook, aggregate, siteAsciiDocConfig = undefined) {
  if (!siteAsciiDocConfig) siteAsciiDocConfig = require('@antora/asciidoc-loader').resolveConfig(playbook)
  const contentCatalog = aggregate.reduce((catalog, descriptor) => {
    const { name, version, nav, files } = descriptor
    delete descriptor.files
    files.forEach((file) => allocateSrc(file, name, version, nav) && catalog.addFile(file))
    descriptor.asciidocConfig = resolveAsciiDocConfig(siteAsciiDocConfig, descriptor)
    catalog.registerComponentVersion(name, version, descriptor)
    return catalog
  }, new ContentCatalog(playbook))
  registerSiteStartPage(playbook, contentCatalog)
  return contentCatalog
}

function allocateSrc (file, component, version, nav) {
  const filepath = file.path
  const pathSegments = filepath.split('/')
  const navInfo = nav && getNavInfo(filepath, nav)
  if (navInfo) {
    file.nav = navInfo
    file.src.family = 'nav'
    if (pathSegments[0] === 'modules' && pathSegments.length > 2) {
      file.src.module = pathSegments[1]
      // relative to modules/<module>
      file.src.relative = pathSegments.slice(2).join('/')
      file.src.moduleRootPath = calculateRootPath(pathSegments.length - 3)
    } else {
      // relative to root
      file.src.relative = filepath
    }
  } else if (pathSegments[0] === 'modules') {
    let familyFolder = pathSegments[2]
    switch (familyFolder) {
      case 'pages':
        // this location for partials is deprecated; warn starting in Antora 3.x
        if (pathSegments[3] === '_partials') {
          file.src.family = 'partial'
          // relative to modules/<module>/pages/_partials (deprecated)
          file.src.relative = pathSegments.slice(4).join('/')
        } else if (file.src.mediaType === 'text/asciidoc') {
          file.src.family = 'page'
          // relative to modules/<module>/pages
          file.src.relative = pathSegments.slice(3).join('/')
        } else {
          // ignore file
          return
        }
        break
      case 'assets':
        switch ((familyFolder = pathSegments[3])) {
          case 'attachments':
          case 'images':
            file.src.family = familyFolder.substr(0, familyFolder.length - 1)
            // relative to modules/<module>/assets/<family>s
            file.src.relative = pathSegments.slice(4).join('/')
            break
          default:
            // ignore file
            return
        }
        break
      case 'attachments':
      case 'examples':
      case 'images':
      case 'partials':
        file.src.family = familyFolder.substr(0, familyFolder.length - 1)
        // relative to modules/<module>/<family>s
        file.src.relative = pathSegments.slice(3).join('/')
        break
      default:
        // ignore file
        return
    }
    file.src.module = pathSegments[1]
    file.src.moduleRootPath = calculateRootPath(pathSegments.length - 3)
  } else {
    // ignore file
    return
  }

  file.src.component = component
  file.src.version = version
  return true
}

/**
 * Return navigation properties if this file is registered as a navigation file.
 *
 * @param {String} filepath - The path of the virtual file to match.
 * @param {Array} nav - The array of navigation entries from the component descriptor.
 *
 * @returns {Object} An object of properties, which includes the navigation
 * index, if this file is a navigation file, or undefined if it's not.
 */
function getNavInfo (filepath, nav) {
  const index = nav.findIndex((candidate) => candidate === filepath)
  if (~index) return { index }
}

function registerSiteStartPage (playbook, contentCatalog) {
  const pageSpec = playbook.site.startPage
  if (!pageSpec) return
  const rel = contentCatalog.resolvePage(pageSpec)
  if (rel) {
    const src = Object.assign({}, START_PAGE_ID, {
      family: 'alias',
      basename: 'index.adoc',
      stem: 'index',
      mediaType: 'text/asciidoc',
    })
    contentCatalog.addFile({ src, rel })
  } else {
    console.warn('Start page specified for site not found: ' + pageSpec)
    //throw new Error('Start page specified for site not found: ' + pageSpec)
  }
}

function resolveAsciiDocConfig (siteAsciiDocConfig, { asciidoc }) {
  const scopedAttributes = (asciidoc || {}).attributes
  if (scopedAttributes) {
    const siteAttributes = siteAsciiDocConfig.attributes
    if (siteAttributes) {
      const attributes = Object.keys(scopedAttributes).reduce((accum, name) => {
        if (name in siteAttributes) {
          const currentVal = siteAttributes[name]
          if (currentVal === false || String(currentVal).endsWith('@')) accum[name] = scopedAttributes[name]
        } else {
          accum[name] = scopedAttributes[name]
        }
        return accum
      }, {})
      return Object.keys(attributes).length
        ? Object.assign({}, siteAsciiDocConfig, { attributes: Object.assign({}, siteAttributes, attributes) })
        : siteAsciiDocConfig
    } else {
      return Object.assign({}, siteAsciiDocConfig, { attributes: scopedAttributes })
    }
  } else {
    return siteAsciiDocConfig
  }
}

function calculateRootPath (depth) {
  return depth
    ? Array(depth)
      .fill('..')
      .join('/')
    : '.'
}

module.exports = classifyContent
