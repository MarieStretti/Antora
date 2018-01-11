'use strict'

const path = require('path')

/**
 * Computes the shortest relative path between two URLs.
 *
 * This function takes into account directory index URLs and extensionless
 * URLs. It assumes it's working with root-relative URLs, not qualified URLs
 * with potentially different hosts.
 *
 * @memberof asciidoc-loader
 *
 * @param {String} from - The root-relative start URL.
 * @param {String} to - The root-relative target URL.
 *
 * @returns {String} The shortest relative path to travel from the start URL to the target URL.
 */
function computeRelativeUrlPath (from, to) {
  const fromDir = from.charAt(from.length - 1) === '/' ? from.substr(0, from.length - 1) : path.dirname(from)
  // NOTE temporarily append _ to preserve the trailing slash of a directory index
  return to.charAt(to.length - 1) === '/' ? path.relative(fromDir, to + '_').slice(0, -1) : path.relative(fromDir, to)
}

module.exports = computeRelativeUrlPath
