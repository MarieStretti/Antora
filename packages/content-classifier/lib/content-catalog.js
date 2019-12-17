'use strict'

const File = require('./file')
const parseResourceId = require('./util/parse-resource-id')
const { posix: path } = require('path')
const resolveResource = require('./util/resolve-resource')
const versionCompare = require('./util/version-compare-desc')

const { START_PAGE_ID } = require('./constants')
const SPACE_RX = / /g

const $components = Symbol('components')
const $files = Symbol('files')

class ContentCatalog {
  constructor (playbook = {}) {
    this[$components] = new Map()
    this[$files] = new Map()
    this.htmlUrlExtensionStyle = (playbook.urls || {}).htmlExtensionStyle || 'default'
    this.urlRedirectFacility = (playbook.urls || {}).redirectFacility || 'static'
  }

  registerComponentVersion (name, version, descriptor = {}) {
    const { asciidocConfig, displayVersion, prerelease, title, startPage: startPageSpec } = descriptor
    let startPage = this.resolvePage(startPageSpec || 'index.adoc', { component: name, version, module: 'ROOT' })
    if (!startPage) {
      //if (startPageSpec) throw new Error(`Start page specified for ${version}@${name} not found: ` + startPageSpec)
      if (startPageSpec) console.warn(`Start page specified for ${version}@${name} not found: ` + startPageSpec)
      // TODO throw error or report warning; for now, we're just faking it
      //throw new Error(`Start page for ${version}@${name} not specified and no index page found.`)
      const startPageSrc = expandPageSrc({ component: name, version, module: 'ROOT', relative: 'index.adoc' })
      const startPageOut = computeOut(startPageSrc, startPageSrc.family, this.htmlUrlExtensionStyle)
      const startPagePub = computePub(startPageSrc, startPageOut, startPageSrc.family, this.htmlUrlExtensionStyle)
      startPage = { pub: startPagePub }
    }
    const componentVersion = {
      displayVersion: displayVersion || version,
      title: title || name,
      url: startPage.pub.url,
      version,
    }
    if (prerelease) {
      componentVersion.prerelease = prerelease
      if (!displayVersion && (typeof prerelease === 'string' || prerelease instanceof String)) {
        const ch0 = prerelease.charAt()
        const sep = ch0 === '-' || ch0 === '.' ? '' : ' '
        componentVersion.displayVersion = `${version}${sep}${prerelease}`
      }
    }
    if (asciidocConfig) componentVersion.asciidocConfig = asciidocConfig
    const component = this.getComponent(name)
    if (component) {
      const componentVersions = component.versions
      const insertIdx = componentVersions.findIndex(({ version: candidate }) => {
        if (candidate === version) throw new Error(`Duplicate version detected for component ${name}: ${version}`)
        return versionCompare(candidate, version) > 0
      })
      if (~insertIdx) {
        componentVersions.splice(insertIdx, 0, componentVersion)
      } else {
        componentVersions.push(componentVersion)
      }
      component.latest = componentVersions.find((candidate) => !candidate.prerelease) || componentVersions[0]
    } else {
      this[$components].set(
        name,
        Object.defineProperties(
          { name, latest: componentVersion, versions: [componentVersion] },
          {
            // NOTE alias latestVersion to latest for backwards compatibility
            latestVersion: {
              get: function () {
                return this.latest
              },
            },
            title: {
              get: function () {
                return this.latest.title
              },
            },
            url: {
              get: function () {
                return this.latest.url
              },
            },
          }
        )
      )
    }
  }

  // QUESTION should this method return the file added?
  addFile (file) {
    const key = generateKey(file.src)
    if (this[$files].has(key)) {
      throw new Error(`Duplicate ${file.src.family}: ${key.replace(':' + file.src.family + '$', ':')}`)
    }
    if (!File.isVinyl(file)) file = new File(file)
    const family = file.src.family
    const actingFamily = family === 'alias' ? file.rel.src.family : family
    let publishable
    if (file.out) {
      publishable = true
    } else if (
      (actingFamily === 'page' || actingFamily === 'image' || actingFamily === 'attachment') &&
      !~('/' + file.src.relative).indexOf('/_')
    ) {
      publishable = true
      file.out = computeOut(file.src, actingFamily, this.htmlUrlExtensionStyle)
    }
    if (!file.pub && (publishable || actingFamily === 'nav')) {
      file.pub = computePub(file.src, file.out, actingFamily, this.htmlUrlExtensionStyle)
    }
    this[$files].set(key, file)
  }

  findBy (criteria) {
    const criteriaEntries = Object.entries(criteria)
    const accum = []
    for (const entry of this[$files]) {
      const candidate = entry[1]
      const candidateSrc = candidate.src
      if (criteriaEntries.every(([key, val]) => candidateSrc[key] === val)) accum.push(candidate)
    }
    return accum
  }

  getById ({ component, version, module, family, relative }) {
    return this[$files].get(generateKey({ component, version, module, family, relative }))
  }

  getByPath ({ component, version, path: path_ }) {
    for (const entry of this[$files]) {
      const candidate = entry[1]
      if (candidate.path === path_ && candidate.src.component === component && candidate.src.version === version) {
        return candidate
      }
    }
  }

  getComponent (name) {
    return this[$components].get(name)
  }

  getComponentVersion (component, version) {
    return (component.versions || (this.getComponent(component) || {}).versions || []).find(
      (candidate) => candidate.version === version
    )
  }

  getComponentMap () {
    const accum = {}
    for (const [name, component] of this[$components]) {
      accum[name] = component
    }
    return accum
  }

  getComponentMapSortedBy (property) {
    return this.getComponentsSortedBy(property).reduce((accum, it) => (accum[it.name] = it) && accum, {})
  }

  getComponents () {
    return [...this[$components].values()]
  }

  getComponentsSortedBy (property) {
    return this.getComponents().sort((a, b) => a[property].localeCompare(b[property]))
  }

  getAll () {
    return [...this[$files].values()]
  }

  getPages () {
    const accum = []
    for (const entry of this[$files]) {
      const candidate = entry[1]
      if (candidate.src.family === 'page') accum.push(candidate)
    }
    return accum
  }

  // TODO add `follow` argument to control whether alias is followed
  getSiteStartPage () {
    const page = this.getById(START_PAGE_ID) || this.getById(Object.assign({}, START_PAGE_ID, { family: 'alias' }))
    if (page) return page.src.family === 'alias' ? page.rel : page
  }

  // QUESTION should this be addPageAlias?
  registerPageAlias (aliasSpec, targetPage) {
    const src = parseResourceId(aliasSpec, targetPage.src, 'page', ['page'])
    // QUESTION should we throw an error if alias is invalid?
    if (!src) return
    const component = this.getComponent(src.component)
    if (component) {
      // NOTE version is not set when alias specifies a component, but not a version
      if (!src.version) src.version = component.latest.version
      const existingPage = this.getById(src)
      if (existingPage) {
        // TODO we'll need some way to easily get a displayable page ID
        let qualifiedSpec = generateKey(existingPage.src)
        qualifiedSpec = qualifiedSpec.replace(':page$', ':')
        const message = `Page alias cannot reference ${targetPage === existingPage ? 'itself' : 'an existing page'}`
        throw new Error(message + ': ' + qualifiedSpec)
      }
    } else if (!src.version) {
      // QUESTION is this correct to assume?
      src.version = 'master'
    }
    expandPageSrc(src, 'alias')
    // QUESTION should we use src.origin instead of rel with type='link'?
    //src.origin = { type: 'link', target: targetPage }
    // NOTE the redirect producer will populate contents when the redirect facility is 'static'
    // QUESTION should we set the path property on the alias file?
    const file = new File({ path: targetPage.path, mediaType: src.mediaType, src, rel: targetPage })
    this.addFile(file)
    return file
  }

  /**
   * Attempts to resolve a string contextual page ID spec to a file in the catalog.
   *
   * Parses the specified contextual page ID spec into a page ID object, then attempts to lookup a
   * file with this page ID in the catalog. If a component is specified, but not a version, the
   * latest version of the component stored in the catalog is used. If a file cannot be resolved,
   * the function returns undefined. If the spec does not match the page ID syntax, this function
   * throws an error.
   *
   * @param {String} spec - The contextual page ID spec (e.g.,
   *   version@component:module:topic/page followed by optional .adoc extension).
   * @param {ContentCatalog} catalog - The content catalog in which to resolve the page file.
   * @param {Object} [ctx={}] - The context to use to qualified the contextual page ID.
   *
   * @return {File} The virtual file to which the contextual page ID spec refers, or undefined if the
   * file cannot be resolved.
   */
  resolvePage (spec, context = {}) {
    return resolveResource(spec, this, context, 'page', ['page'])
  }

  resolveResource (spec, context = {}, defaultFamily = undefined, permittedFamilies = undefined) {
    return resolveResource(spec, this, context, defaultFamily, permittedFamilies)
  }

  exportToModel () {
    const target = this
    return new (class ContentCatalog {
      findBy (criteria) {
        return target.findBy(criteria)
      }

      getAll () {
        return target.getAll()
      }

      getById (id) {
        return target.getById(id)
      }

      getComponent (name) {
        return target.getComponent(name)
      }

      getComponents () {
        return target.getComponents()
      }

      getPages () {
        return target.getPages()
      }

      resolvePage (spec, context = {}) {
        return target.resolvePage(spec, context)
      }

      resolveResource (spec, context = {}, defaultFamily = undefined, permittedFamilies = undefined) {
        return target.resolveResource(spec, context, defaultFamily, permittedFamilies)
      }
    })()
  }
}

/**
 * @deprecated superceded by getAll()
 */
ContentCatalog.prototype.getFiles = ContentCatalog.prototype.getAll

function generateKey ({ component, version, module, family, relative }) {
  return `${version}@${component}:${module}:${family}$${relative}`
}

function expandPageSrc (src, family = 'page') {
  src.family = family
  src.basename = path.basename(src.relative)
  src.extname = path.extname(src.relative)
  src.stem = path.basename(src.relative, src.extname)
  src.mediaType = 'text/asciidoc'
  return src
}

function computeOut (src, family, htmlUrlExtensionStyle) {
  const component = src.component
  const version = src.version === 'master' ? '' : src.version
  const module = src.module === 'ROOT' ? '' : src.module

  const stem = src.stem
  let basename = src.mediaType === 'text/asciidoc' ? stem + '.html' : src.basename
  let indexifyPathSegment = ''
  if (family === 'page' && stem !== 'index' && htmlUrlExtensionStyle === 'indexify') {
    basename = 'index.html'
    indexifyPathSegment = stem
  }

  let familyPathSegment = ''
  if (family === 'image') {
    familyPathSegment = '_images'
  } else if (family === 'attachment') {
    familyPathSegment = '_attachments'
  }

  const modulePath = path.join(component, version, module)
  const dirname = path.join(modulePath, familyPathSegment, path.dirname(src.relative), indexifyPathSegment)
  const path_ = path.join(dirname, basename)
  const moduleRootPath = path.relative(dirname, modulePath) || '.'
  const rootPath = path.relative(dirname, '') || '.'

  return {
    dirname,
    basename,
    path: path_,
    moduleRootPath,
    rootPath,
  }
}

function computePub (src, out, family, htmlUrlExtensionStyle) {
  const pub = {}
  let url
  if (family === 'nav') {
    const urlSegments = [src.component]
    if (src.version !== 'master') urlSegments.push(src.version)
    if (src.module && src.module !== 'ROOT') urlSegments.push(src.module)
    // an artificial URL used for resolving page references in navigation model
    url = '/' + urlSegments.join('/') + '/'
    pub.moduleRootPath = '.'
  } else if (family === 'page') {
    const urlSegments = out.path.split('/')
    const lastUrlSegmentIdx = urlSegments.length - 1
    if (htmlUrlExtensionStyle === 'drop') {
      // drop just the .html extension or, if the filename is index.html, the whole segment
      const lastUrlSegment = urlSegments[lastUrlSegmentIdx]
      urlSegments[lastUrlSegmentIdx] =
        lastUrlSegment === 'index.html' ? '' : lastUrlSegment.substr(0, lastUrlSegment.length - 5)
    } else if (htmlUrlExtensionStyle === 'indexify') {
      urlSegments[lastUrlSegmentIdx] = ''
    }
    url = '/' + urlSegments.join('/')
  } else {
    url = '/' + out.path
  }

  pub.url = ~url.indexOf(' ') ? url.replace(SPACE_RX, '%20') : url

  if (out) {
    pub.moduleRootPath = out.moduleRootPath
    pub.rootPath = out.rootPath
  }

  return pub
}

module.exports = ContentCatalog
