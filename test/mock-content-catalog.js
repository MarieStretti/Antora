'use strict'

const { posix: path } = require('path')
const resolvePage = require('@antora/content-classifier/lib/util/resolve-page')
const { spy } = require('./test-utils')

function mockContentCatalog (seed = []) {
  if (!Array.isArray(seed)) seed = [seed]
  const familyDirs = {
    alias: 'pages',
    example: 'examples',
    image: 'images',
    navigation: '',
    page: 'pages',
    partial: 'pages/_partials',
  }
  const components = {}
  const entries = []
  const entriesById = {}
  const entriesByPath = {}
  const entriesByFamily = {}
  seed.forEach(({ component, version, module, family, relative, contents, mediaType, navIndex, indexify }) => {
    if (!component) component = 'component-a'
    if (!version) version = 'master'
    if (module == null) module = 'module-a'
    if (!family) family = 'page'
    if (!contents) contents = ''
    if (component in components) {
      // NOTE use last registered as latest version
      components[component].latestVersion = { version }
    } else {
      components[component] = { latestVersion: { version } }
    }
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
        basename: path.basename(relative),
        stem: path.basename(relative, path.extname(relative)),
      },
    }
    if (mediaType) entry.src.mediaType = entry.mediaType = mediaType
    const pubVersion = version === 'master' ? '' : version
    const pubModule = module === 'ROOT' ? '' : module
    if (family === 'page' || family === 'alias') {
      entry.out = {
        path: path.join(component, pubVersion, pubModule, relative.slice(0, -5) + (indexify ? '/' : '.html')),
        moduleRootPath: relative.includes('/')
          ? Array(relative.split('/').length - 1)
            .fill('..')
            .join('/')
          : '.',
      }
      entry.pub = { url: '/' + entry.out.path, moduleRootPath: entry.out.moduleRootPath }
    } else if (family === 'navigation') {
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
    getFiles: () => entries,
    resolvePage: function (spec, ctx) {
      return resolvePage(spec, this, ctx)
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
