'use strict'

const { posix: path } = require('path')

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
  if (to.charAt(to.length - 1) === '/') {
    return from === to ? './' : path.relative(path.dirname(from + '.'), to) + '/'
  } else {
    return path.relative(path.dirname(from + '.'), to)
  }
}

module.exports = computeRelativeUrlPath
