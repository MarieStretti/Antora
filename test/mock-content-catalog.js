'use strict'

const { posix: path } = require('path')
const resolveResource = require('@antora/content-classifier/lib/util/resolve-resource')
const { spy } = require('./test-utils')

const SPACE_RX = / /g

function mockContentCatalog (seed = []) {
  if (!Array.isArray(seed)) seed = [seed]
  const familyDirs = {
    alias: 'pages',
    example: 'examples',
    image: 'images',
    nav: '',
    page: 'pages',
    partial: 'pages/_partials',
  }
  const components = {}
  const entries = []
  const entriesById = {}
  const entriesByPath = {}
  const entriesByFamily = {}
  seed.forEach(({ component, version, module, family, relative, contents, mediaType, navIndex, indexify }) => {
    if (component == null) component = 'component-a'
    if (version == null) version = 'master'
    if (module == null) module = 'module-a'
    if (!family) family = 'page'
    if (!contents) contents = ''
    let versions
    if (component in components) {
      versions = components[component].versions
      if (versions.findIndex((it) => it.version === version) < 0) versions.unshift({ version })
    } else {
      components[component] = { name: component, versions: (versions = [{ version }]) }
    }
    // NOTE assume we want the latest to be the last version we register
    components[component].latest = versions[0]
    const componentVersionKey = buildComponentVersionKey(component, version)
    const componentRelativePath = path.join(module ? 'modules' : '', module, familyDirs[family], relative)
    const entry = {
      path: componentRelativePath,
      dirname: path.dirname(componentRelativePath),
      contents: Buffer.from(contents),
      src: {
        path: componentRelativePath,
        component,
        version,
        module: module === '' ? undefined : module,
        relative,
        family,
        basename: path.basename(relative),
        stem: path.basename(relative, path.extname(relative)),
      },
    }
    if (mediaType) entry.src.mediaType = entry.mediaType = mediaType
    const pubVersion = version === 'master' ? '' : version
    const pubModule = module === 'ROOT' ? '' : module
    if (family === 'page' || family === 'alias') {
      if (!~('/' + relative).indexOf('/_')) {
        entry.out = {
          path: path.join(component, pubVersion, pubModule, relative.slice(0, -5) + (indexify ? '/' : '.html')),
          moduleRootPath: relative.includes('/')
            ? Array(relative.split('/').length - 1)
              .fill('..')
              .join('/')
            : '.',
        }
        let url = '/' + entry.out.path
        if (~url.indexOf(' ')) url = url.replace(SPACE_RX, '%20')
        entry.pub = { url, moduleRootPath: entry.out.moduleRootPath }
      }
    } else if (family === 'nav') {
      entry.pub = {
        url: '/' + path.join(component, pubVersion, pubModule) + '/',
        moduleRootPath: '.',
      }
      entry.nav = { index: navIndex }
    }
    const byIdKey = componentVersionKey + (module || '') + ':' + family + '$' + relative
    const byPathKey = componentVersionKey + componentRelativePath
    entries.push(entry)
    entriesById[byIdKey] = entriesByPath[byPathKey] = entry
    if (!(family in entriesByFamily)) entriesByFamily[family] = []
    entriesByFamily[family].push(entry)
  })

  return {
    findBy: ({ family }) => entriesByFamily[family] || [],
    getById: ({ component, version, module, family, relative }) =>
      entriesById[buildComponentVersionKey(component, version) + (module || '') + ':' + family + '$' + relative],
    getByPath: ({ path: path_, component, version }) =>
      entriesByPath[buildComponentVersionKey(component, version) + path_],
    getComponent: (name) => components[name],
    getComponents: () => Object.values(components),
    getComponentVersion: (component, version) =>
      (typeof component === 'string' ? components[component] : component).versions.find((it) => it.version === version),
    getFiles: () => entries,
    resolvePage: function (spec, ctx = {}) {
      return resolveResource(spec, this, ctx, ['page'])
    },
    resolveResource: function (spec, ctx = {}, permittedFamilies = undefined, defaultFamily = undefined) {
      return resolveResource(spec, this, ctx, permittedFamilies, defaultFamily)
    },
    spyOn: function (...names) {
      names.forEach((name) => (this[name] = spy(this[name])))
      return this
    },
  }
}

function buildComponentVersionKey (component, version) {
  return version + '@' + component + ':'
}

module.exports = mockContentCatalog
