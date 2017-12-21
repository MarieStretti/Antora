'use strict'

const computeRelativeUrlPath = require('../util/compute-relative-url-path')
const Opal = global.Opal
const resolvePage = require('./resolve-page')
const splitOnce = require('../util/split-once')

/**
 * Converts the specified page reference to an HTML link.
 *
 * Parses the page reference (page ID and optional fragment) and resolves the corresponding file
 * from the content catalog. Resolves the relative URL path from the current page to the target page
 * and uses that path to create an HTML link pointing to the published target page.
 *
 * @memberOf module:asciidoc-loader
 *
 * @param {String} refSpec - The target of the xref macro that specifies a page reference.
 * @param {String} content - The content (i.e., formatted text) of the link (undefined if not specified).
 * @param {File} currentPage - The virtual file for the current page.
 * @param {ContentCatalog} catalog - The content catalog that contains the virtual files in the site.
 * @returns {Object} A map ({ content, target }) with the resolved content and target to make an HTML link.
 */
function convertPageRef (refSpec, content, currentPage, catalog) {
  let targetPage
  const [pageIdSpec, fragment] = splitOnce(refSpec, '#')
  try {
    if (!(targetPage = resolvePage(pageIdSpec, catalog, currentPage.src))) {
      // TODO log "Unresolved page ID"
      return { content: `${pageIdSpec}.adoc${fragment ? '#' + fragment : ''}`, target: '#' }
    }
  } catch (e) {
    // TODO log "Invalid page ID syntax" (or e.message)
    return { content: refSpec, target: '#' }
  }

  let target = computeRelativeUrlPath(currentPage.pub.url, targetPage.pub.url)
  if (fragment) target = target + '#' + fragment
  if (!content) content = `${pageIdSpec}.adoc${fragment ? '#' + fragment : ''}`

  return { content, target }
}

module.exports = convertPageRef
