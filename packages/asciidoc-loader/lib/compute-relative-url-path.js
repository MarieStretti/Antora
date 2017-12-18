'use strict'

const path = require('path')

/**
 * Compute the shortest relative path between two URLs, taking into account
 * directory index URLs and extensionless URLs.
 *
 * This function assumes it is working with root-relative URLs. It does not
 * consider qualified URLs with different hosts.
 *
 * @param {String} from - the root-relative start URL.
 * @param {String} to - the root-relative target URL.
 *
 * @return {String} - the shortest relative path to travel from the start URL to the target URL.
 */
module.exports = (from, to) => {
  const fromDir = from.endsWith('/') ? from.slice(0, -1) : path.dirname(from)
  // NOTE use _ as a placeholder to preserve trailing slash of a directory index
  return to.endsWith('/') ? path.relative(fromDir, to + '_').slice(0, -1) : path.relative(fromDir, to)
}
