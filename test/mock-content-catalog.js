'use strict'

const path = require('path')
const { spy } = require('./test-utils')

function mockContentCatalog (seed = []) {
  if (!Array.isArray(seed)) seed = [seed]
  const familyDirs = {
    example: 'examples',
    page: 'pages',
    partial: 'pages/_partials',
    navigation: '',
  }
  const entries = []
  const entriesById = {}
  const entriesByPath = {}
  const entriesByFamily = {}
  seed.forEach(({ component, version, module, family, relative, contents, navIndex, indexify }) => {
    if (!component) component = 'component-a'
    if (!version) version = 'master'
    if (module == null) module = 'module-a'
    if (!contents) contents = ''
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
      },
    }
    if (family === 'page' || family === 'navigation') {
      const pubVersion = version === 'master' ? '' : version
      const pubModule = module === 'ROOT' ? '' : module
      if (family === 'page') {
        entry.pub = {
          url: '/' + path.join(component, pubVersion, pubModule, relative.slice(0, -5) + (indexify ? '/' : '.html')),
          moduleRootPath: relative.includes('/')
            ? Array(relative.split('/').length - 1)
              .fill('..')
              .join('/')
            : '.',
        }
      } else if (family === 'navigation') {
        entry.pub = {
          url: '/' + path.join(component, pubVersion, pubModule) + '/',
          moduleRootPath: '.',
        }
        entry.nav = { index: navIndex }
      }
    }
    const byIdKey = componentVersionKey + (module || '') + ':' + family + '$' + relative
    const byPathKey = componentVersionKey + componentRelativePath
    entries.push(entry)
    entriesById[byIdKey] = entriesByPath[byPathKey] = entry
    if (!(family in entriesByFamily)) entriesByFamily[family] = []
    entriesByFamily[family].push(entry)
  })

  return {
    findBy: ({ family }) => entriesByFamily[family],
    getById: ({ component, version, module, family, relative }) =>
      entriesById[buildComponentVersionKey(component, version) + (module || '') + ':' + family + '$' + relative],
    getByPath: ({ path: path_, component, version }) =>
      entriesByPath[buildComponentVersionKey(component, version) + path_],
    getFiles: () => entries,
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
