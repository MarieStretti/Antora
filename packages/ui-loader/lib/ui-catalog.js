'use strict'

const _ = require('lodash')

const $files = Symbol('files')

class UiCatalog {
  constructor () {
    this[$files] = {}
  }

  getAll () {
    return Object.values(this[$files])
  }

  addFile (file) {
    const key = generateKey(file)
    if (key in this[$files]) {
      throw new Error('Duplicate file')
    }
    this[$files][key] = file
  }

  findByType (type) {
    return _.filter(this[$files], { type })
  }
}

/**
 * @deprecated superceded by getAll
 */
UiCatalog.prototype.getFiles = UiCatalog.prototype.getAll

function generateKey ({ type, path }) {
  return [type, ...path.split('/')]
}

module.exports = UiCatalog
