'use strict'

const loadAsciiDoc = require('@antora/asciidoc-loader')
const NavigationCatalog = require('./navigation-catalog')

const LINK_RX = /<a href="([^"]+)"(?: class="([^"]+)")?>(.+?)<\/a>/

/**
 * Builds a {NavigationCatalog} from files in the navigation family that are
 * stored in the content catalog.
 *
 * Queries the content catalog for files in the navigation family. Then uses
 * the AsciiDoc Loader component to parse the source of each file into an
 * Asciidoctor Document object. It then looks each file for one or more nested
 * unordered lists, which are used to build the navigation trees. It then
 * combines those trees in sorted order as a navigation menu, which gets
 * stored in the navigation catalog by component/version pair.
 *
 * @memberof navigation-builder
 *
 * @param {ContentCatalog} [contentCatalog=undefined] - The content catalog
 *   that provides access to the virtual files in the site.
 *
 * @returns {NavigationCatalog} A navigation catalog built from the navigation
 * files in the content catalog.
 */
function buildNavigation (contentCatalog) {
  const navFiles = contentCatalog.findBy({ family: 'navigation' }) || []
  if (navFiles.length === 0) return new NavigationCatalog()
  return navFiles
    .map((navFile) => loadNavigationFile(navFile, {}, contentCatalog))
    .reduce((accum, treeSet) => accum.concat(treeSet), [])
    .reduce((catalog, { component, version, tree }) => {
      catalog.addTree(component, version, tree)
      return catalog
    }, new NavigationCatalog())
}

function loadNavigationFile (navFile, customAttrs, contentCatalog) {
  const { src: { component, version }, nav: { index } } = navFile
  const lists = loadAsciiDoc(navFile, customAttrs, contentCatalog, { relativizePageRefs: false }).blocks.filter(
    (block) => block.context === 'ulist'
  )
  if (lists.length === 0) return []
  return lists.map((list, idx) => {
    const tree = buildNavigationTree(list.getTitle(), list)
    tree.root = true
    tree.order = idx === 0 ? index : parseFloat((index + idx / lists.length).toFixed(4))
    return { component, version, tree }
  })
}

function getChildList (node) {
  const block0 = node.blocks[0]
  if (block0 && block0.context === 'ulist') return block0
}

function buildNavigationTree (formattedContent, list) {
  const entry = formattedContent ? partitionContent(formattedContent) : {}

  if (list) {
    entry.items = list.blocks.map((item) => buildNavigationTree(item.$text(), getChildList(item)))
  }

  return entry
}

// atomize? distill? decompose?
function partitionContent (content) {
  if (~content.indexOf('<a')) {
    const match = content.match(LINK_RX)
    if (match) {
      let url = match[1]
      let urlType = 'external'
      if (match[2] === 'page') {
        urlType = 'internal'
      } else if (url.charAt() === '#') {
        urlType = 'fragment'
      }
      return { content: match[3], url, urlType }
    }
  }
  return { content }
}

module.exports = buildNavigation
