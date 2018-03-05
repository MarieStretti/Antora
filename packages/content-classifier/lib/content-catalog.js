'use strict'

const _ = require('lodash')
const File = require('./file')
const parsePageId = require('./util/parse-page-id')
const { posix: path } = require('path')
const resolvePage = require('./util/resolve-page')
const versionCompare = require('./util/version-compare-desc')

const $components = Symbol('components')
const $files = Symbol('files')
const $generateId = Symbol('generateId')

class ContentCatalog {
  constructor (playbook) {
    this[$components] = {}
    this[$files] = {}
    this.htmlUrlExtensionStyle = _.get(playbook, ['urls', 'htmlExtensionStyle'], 'default')
    //this.urlRedirectFacility = _.get(playbook, ['urls', 'redirectFacility'], 'static')
  }

  addComponentVersion (name, version, title, url) {
    const component = this[$components][name]
    if (component) {
      const versions = component.versions
      const insertIdx = versions.findIndex((candidate) => {
        const verdict = versionCompare(candidate.version, version)
        if (verdict === 0) throw new Error(`Duplicate version detected for component ${name}: ${version}`)
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
      this[$components][name] = Object.defineProperty(
        { name, title, url, versions: [{ title, version, url }] },
        'latestVersion',
        {
          get: function () {
            return this.versions[0]
          },
        }
      )
    }
  }

  // QUESTION should this method return the file added?
  addFile (file) {
    const id = this[$generateId](_.pick(file.src, 'component', 'version', 'module', 'family', 'relative'))
    if (id in this[$files]) throw new Error(`Duplicate ${file.src.family}: ${id.substr(id.indexOf('/') + 1)}`)
    if (!File.isVinyl(file)) file = new File(file)
    const family = file.src.family
    const actingFamily = family === 'alias' ? file.rel.src.family : family
    if (!('out' in file) && (actingFamily === 'page' || actingFamily === 'image' || actingFamily === 'attachment')) {
      file.out = computeOut(file.src, actingFamily, this.htmlUrlExtensionStyle)
    }
    if (
      !('pub' in file) &&
      (actingFamily === 'page' ||
        actingFamily === 'image' ||
        actingFamily === 'attachment' ||
        actingFamily === 'navigation')
    ) {
      file.pub = computePub(file.src, file.out, actingFamily, this.htmlUrlExtensionStyle)
      //if (family === 'alias' && this.urlRedirectFacility !== 'static') delete file.out
    }
    this[$files][id] = file
  }

  findBy (options) {
    const srcFilter = _.pick(options, 'component', 'version', 'module', 'family', 'relative', 'basename', 'extname')
    return _.filter(this[$files], { src: srcFilter })
  }

  getComponent (name) {
    return this[$components][name]
  }

  getComponents () {
    return Object.values(this[$components])
  }

  //getComponentVersion (name, version) {
  //  const component = this.getComponent(name)
  //  return component && component.versions.find((candidate) => candidate.version === version)
  //}

  getFiles () {
    return Object.values(this[$files])
  }

  getById ({ component, version, module, family, relative }) {
    const id = this[$generateId]({ component, version, module, family, relative })
    return this[$files][id]
  }

  getByPath ({ component, version, path: path_ }) {
    return _.find(this[$files], { path: path_, src: { component, version } })
  }

  // QUESTION should this be addPageAlias?
  registerPageAlias (aliasSpec, targetPage) {
    const src = parsePageId(aliasSpec, targetPage.src)
    // QUESTION should we throw an error if alias is invalid or out of bounds?
    if (!src) return
    const component = this.getComponent(src.component)
    if (!component) return
    if (src.version) {
      const version = src.version
      if (!component.versions.find((candidate) => candidate.version === version)) return
    } else {
      src.version = component.latestVersion.version
    }
    const existingPage = this.getById(src)
    if (existingPage) {
      // TODO we'll need some way to easily get a displayable page ID
      let qualifiedSpec = this[$generateId](existingPage.src)
      qualifiedSpec = qualifiedSpec.substr(qualifiedSpec.indexOf('/') + 1)
      const message =
        existingPage === targetPage
          ? 'Page alias cannot reference itself'
          : 'Page alias cannot reference an existing page'
      throw new Error(message + ': ' + qualifiedSpec)
    }
    src.family = 'alias'
    src.basename = path.basename(src.relative)
    src.extname = path.extname(src.relative)
    src.stem = path.basename(src.relative, src.extname)
    src.mediaType = 'text/asciidoc'
    // QUESTION should we use src.origin instead of rel with type='link'?
    //src.origin = { type: 'link', target: targetPage }
    // NOTE the redirect producer will populate contents when the redirect facility is 'static'
    // QUESTION should we set the path property on the alias file?
    const file = new File({ path: targetPage.path, mediaType: src.mediaType, src, rel: targetPage })
    this.addFile(file)
    return file
  }

  resolvePage (pageSpec, context = {}) {
    return resolvePage(pageSpec, this, context)
  }

  [$generateId] ({ component, version, module, family, relative }) {
    return `$${family}/${version}@${component}:${module}:${relative}`
  }
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
  if (family === 'navigation') {
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

  pub.url = url

  if (out) {
    pub.moduleRootPath = out.moduleRootPath
    pub.rootPath = out.rootPath
  }

  return pub
}

module.exports = ContentCatalog
