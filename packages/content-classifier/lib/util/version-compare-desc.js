'use strict'

const semverCompare = require('semver-compare')

/**
 * A modified semantic version comparison function.
 *
 * Based on a semantic version comparison algorithm with the following
 * enhancements:
 *
 * * Drops the leading "v" character, if present.
 * * Promotes the string "master" to the highest version.
 * * Compares in descending order (e.g., 2.0.0 comes before 1.0.0).
 *
 * @param {String} a - The left version string.
 * @param {String} b - The right version string.
 * @returns 0 if the versions match, -1 if a is greater, or 1 if b is greater.
 */
function versionCompareDesc (a, b) {
  if (a === b) return 0
  if (a === 'master') return -1
  if (b === 'master') return 1
  return -1 * semverCompare(a.charAt() === 'v' ? a.substr(1) : a, b.charAt() === 'v' ? b.substr(1) : b)
}

module.exports = versionCompareDesc
