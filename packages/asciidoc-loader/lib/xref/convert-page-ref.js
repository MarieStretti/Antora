'use strict'

const computeRelativeUrlPath = require('../util/compute-relative-url-path')
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
 * @param {String} content - The content (i.e., formatted text) of the link.
 * @param {File} currentPage - The virtual file for the current page.
 * @param {ContentCatalog} catalog - The content catalog that contains the virtual files in the site.
 * @returns {String} An HTML link for this page reference, falling back to a self-referencing link
 *   that shows the spec string if the file cannot be resolved in the catalog.
 */
function convertPageRef (refSpec, content, currentPage, catalog) {
  let targetPage
  const [pageIdSpec, fragment] = splitOnce(refSpec, '#')
  try {
    if (!(targetPage = resolvePage(pageIdSpec, catalog, currentPage.src))) {
      // TODO log "Unresolved page ID"
      return `<a href="#">${pageIdSpec}.adoc${fragment ? '#' + fragment : ''}</a>`
    }
  } catch (e) {
    // TODO log "Invalid page ID syntax" (or e.message)
    return `<a href="#">${refSpec}</a>`
  }

  let targetUrl = computeRelativeUrlPath(currentPage.pub.url, targetPage.pub.url)
  if (fragment) targetUrl = targetUrl + '#' + fragment

  return `<a href="${targetUrl}">${content}</a>`
}

module.exports = convertPageRef
