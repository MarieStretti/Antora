'use strict'

const loadAsciiDoc = require('@antora/asciidoc-loader')
const NavigationCatalog = require('./navigation-catalog')
const path = require('path')

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
 * @memberOf module:navigation-builder
 *
 * @param {ContentCatalog} [contentCatalog=undefined] - The content catalog
 *   that provides access to the virtual files in the site.
 *
 * @returns {NavigationCatalog} A navigation catalog built from the navigation
 * files in the content catalog.
 */
// rename to loadNavigation?
async function buildNavigation (contentCatalog) {
  const navCatalog = new NavigationCatalog()
  const navFiles = contentCatalog.findBy({ family: 'navigation' })
  if (!navFiles || navFiles.length === 0) return navCatalog
  const treeSets = await Promise.all(
    navFiles.map(async (navFile) =>
      loadNavigationFile(navFile, {}, contentCatalog)
    )
  )
  treeSets
    .reduce((accum, treeSet) => accum.concat(treeSet), [])
    .forEach(({ component, version, tree }) => navCatalog.addTree(component, version, tree))
  return navCatalog
}

async function loadNavigationFile (navFile, customAttrs, contentCatalog) {
  const { src: { component, version }, nav: { index } } = navFile
  // TODO if we pass absolute-page-references to loadAsciiDoc, we wouldn't need to qualify the URL when walking the tree
  const lists = loadAsciiDoc(navFile, customAttrs, contentCatalog)
    .blocks
    .filter((block) => block.context === 'ulist')
  if (lists.length === 0) return []
  const urlContext = navFile.pub.url
  return Promise.all(
    lists.map(async (list, idx) => {
      const tree = buildNavigationTree(list.getTitle(), list, urlContext, true)
      tree.order = idx === 0 ? index : parseFloat((index + (idx / lists.length)).toFixed(4))
      return { component, version, tree }
    })
  )
}

function getChildList (node) {
  const block0 = node.blocks[0]
  if (block0 && block0.context === 'ulist') return block0
}

function buildNavigationTree (formattedContent, list, urlContext, isRoot) {
  let entry
  if (isRoot) {
    entry = {}
    if (formattedContent) entry.title = partitionContent(formattedContent, urlContext)
  } else {
    entry = partitionContent(formattedContent, urlContext)
  }

  if (list) {
    entry.items = list.blocks.map((item) =>
      buildNavigationTree(item.$text(), getChildList(item), urlContext)
    )
  }

  return entry
}

// atomize? distill? decompose?
function partitionContent (content, urlContext) {
  if (content.includes('<a')) {
    const match = content.match(LINK_RX)
    if (match) {
      let url = match[1]
      let urlType = 'external'
      if (match[2] === 'page') {
        url = path.normalize(path.join(urlContext, url))
        urlType = 'internal'
      } else if (url.startsWith('#')) {
        urlType = 'fragment'
      }
      return { content: match[3], url, urlType }
    }
  }
  return { content }
}

module.exports = buildNavigation
