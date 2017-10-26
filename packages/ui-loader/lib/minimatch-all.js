'use strict'

const minimatchAll = require('minimatch-all')

module.exports = function (path, stringOrArray) {
  if (Array.isArray(stringOrArray)) {
    return minimatchAll(path, stringOrArray)
  }
  return minimatchAll(path, [stringOrArray])
}
