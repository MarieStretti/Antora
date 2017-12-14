'use strict'

const _ = require('lodash')
const parsePageId = require('./parse-page-id')

const PAGE_ID_PROPERTY_NAMES = ['component', 'version', 'module', 'family', 'subpath', 'basename']

/**
 * Attempts to resolve a contextual page ID string to a file in the catalog.
 *
 * Parses the specified contextual page ID string into a file src object using
 * parsePageId, then attempts to locate a file with this page ID in the catalog.
 * If a file cannot be resolved, the function returns undefined. If the string
 * does not match the page ID syntax, the function throws an error.
 *
 * @param {String} spec - the contextual page ID spec (e.g., version@component:module:topic/page#fragment)
 * @param {ContentCatalog} catalog - the content catalog in which to resolve the page file
 * @param {Object} ctx - the src context (optional)
 *
 * @return {Object} - page: the virtual file to which the contextual string
 * page ID refers, or undefined if the file cannot be resolved; fragment: the
 * fragment identifier on the page ID, or undefined if not specified
 */
module.exports = (spec, catalog, ctx = {}) => {
  const pageSrc = parsePageId(spec, ctx)

  if (!pageSrc) throw new Error('Invalid page ID syntax')

  return {
    page: catalog.getById(_.pick(pageSrc, ...PAGE_ID_PROPERTY_NAMES)),
    fragment: pageSrc.fragment,
  }
}
