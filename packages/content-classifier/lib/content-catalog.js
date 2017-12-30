'use strict'

const _ = require('lodash')
const versionCompare = require('./util/version-compare-desc')

const $components = Symbol('components')
const $files = Symbol('files')
const $generateId = Symbol('generateId')

class ContentCatalog {
  constructor () {
    this[$components] = {}
    this[$files] = {}
  }

  getComponent (name) {
    return this[$components][name]
  }

  getComponents () {
    return Object.values(this[$components])
  }

  getFiles () {
    return Object.values(this[$files])
  }

  registerComponentVersion (name, version, title, url) {
    const component = this[$components][name]
    if (component) {
      const versions = component.versions
      const insertIdx = versions.findIndex((candidate) => {
        const verdict = versionCompare(candidate.version, version)
        if (verdict === 0) {
          throw new Error(`Duplicate version detected for component ${name}: ${version}`)
        }
        return verdict > 0
      })
      const versionEntry = { title, version, url }
      if (insertIdx < 0) {
        versions.push(versionEntry)
      } else {
        versions.splice(insertIdx, 0, versionEntry)
        if (insertIdx === 0) {
          component.title = title
          component.url = url
        }
      }
    } else {
      this[$components][name] = { name, title, url, versions: [{ title, version, url }] }
    }
  }

  addFile (file) {
    const id = this[$generateId](_.pick(file.src, 'component', 'version', 'module', 'family', 'relative'))
    if (id in this[$files]) {
      throw new Error('Duplicate file')
    }
    this[$files][id] = file
  }

  findBy (options) {
    const srcFilter = _.pick(options, 'component', 'version', 'module', 'family', 'relative', 'basename', 'extname')
    return _.filter(this[$files], { src: srcFilter })
  }

  getById ({ component, version, module, family, relative }) {
    const id = this[$generateId]({ component, version, module, family, relative })
    return this[$files][id]
  }

  getByPath ({ component, version, path: path_ }) {
    return _.find(this[$files], { path: path_, src: { component, version } })
  }

  [$generateId] ({ component, version, module, family, relative }) {
    return `${family}/${version}@${component}:${module}:${relative}`
  }
}

module.exports = ContentCatalog
