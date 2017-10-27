'use strict'

const path = require('path')

const _ = require('lodash')

const $files = Symbol('$files')
const $filesIndex = Symbol('$filesIndex')

// if we really expose addFile(), this class would need to be exposed
class FileCatalog {
  constructor () {
    this[$files] = []
    this[$filesIndex] = {}
  }

  getFiles () {
    return this[$files]
  }

  addFile (file) {
    const id = [
      file.src.component,
      file.src.version,
      file.src.module,
      file.src.family,
      file.src.subpath,
      file.src.basename,
    ]
    if (_.get(this[$filesIndex], id) != null) {
      throw new Error('Duplicate file')
    }
    _.set(this[$filesIndex], id, file)
    this[$files].push(file)
  }

  findBy (options) {
    const srcFilter = _.pick(options, ['component', 'version', 'module', 'family', 'subpath', 'stem', 'basename'])
    return _.filter(this[$files], { src: srcFilter })
  }

  getById ({ component, version, module, family, subpath, basename }) {
    const id = [component, version, module, family, subpath, basename]
    return _.get(this[$filesIndex], id)
  }
}

module.exports = (playbook, corpus) => {
  const vinylCatalog = new FileCatalog()

  corpus.forEach(({ name, title, version, nav, files }) => {
    files.forEach((file) => {
      const pathSegments = file.path.split('/').filter((a) => a !== '')
      partitionSrc(file, pathSegments, nav)

      if (file.src.family == null) {
        return
      }

      file.src.component = name
      file.src.version = version
      file.src.module = pathSegments[1]

      const moduleRootPath = '/' + pathSegments.slice(2, -1).join('/')
      file.src.moduleRootPath = path.relative(moduleRootPath, '/') || '.'

      file.out = resolveOut(file.src, playbook.urls.htmlExtensionStyle)
      file.pub = resolvePub(file.src, file.out, playbook.urls.htmlExtensionStyle, playbook.site.url)

      // maybe addFile() should be "really" public and do all the stuffs above
      vinylCatalog.addFile(file)
    })
  })

  return vinylCatalog
}

function partitionSrc (file, pathSegments, nav) {
  const navIndex = _.indexOf(nav, file.path.slice(1))
  if (navIndex !== -1) {
    file.src.family = 'navigation'
    // start from 2 (after /modules/foo) end at -1 (before filename.ext)
    file.src.subpath = pathSegments.slice(2, -1).join('/')
    // add navigation index for later sorting
    file.nav = { index: navIndex }
  } else if (pathSegments[0] === 'modules') {
    if (pathSegments[2] === 'documents') {
      if (pathSegments[3] === '_fragments') {
        file.src.family = 'fragment'
        // start from 4 (after /modules/foo/documents/_fragments) end at -1 (before filename.ext)
        file.src.subpath = pathSegments.slice(4, -1).join('/')
      } else if (file.src.mediaType === 'text/asciidoc' && file.src.basename !== '_attributes.adoc') {
        file.src.family = 'page'
        // start from 3 (after /modules/foo/documents) end at -1 (before filename.ext)
        file.src.subpath = pathSegments.slice(3, -1).join('/')
      }
    } else if (pathSegments[2] === 'assets') {
      if (pathSegments[3] === 'images') {
        file.src.family = 'image'
        // start from 4 (after /modules/foo/assets/images) end at -1 (before filename.ext)
        file.src.subpath = pathSegments.slice(4, -1).join('/')
      } else if (pathSegments[3] === 'attachments') {
        file.src.family = 'attachment'
        // start from 4 (after /modules/foo/assets/attachments) end at -1 (before filename.ext)
        file.src.subpath = pathSegments.slice(4, -1).join('/')
      }
    } else if (pathSegments[2] === 'samples') {
      file.src.family = 'sample'
      // start from 3 (after /modules/foo/samples) end at -1 (before filename.ext)
      file.src.subpath = pathSegments.slice(3, -1).join('/')
    }
  }
}

function resolveOut (src, htmlExtensionStyle = 'default') {
  const version = src.version === 'master' ? '' : src.version
  const module = src.module === 'ROOT' ? '' : src.module

  const extname = src.extname === '.adoc' ? '.html' : src.extname
  let basename = src.stem + extname

  let indexifyPathSegment = ''
  if (src.family === 'page' && src.stem !== 'index' && htmlExtensionStyle === 'indexify') {
    basename = 'index.html'
    indexifyPathSegment = src.stem
  }

  let familyPathSegment = ''
  if (src.family === 'image') {
    familyPathSegment = '_images'
  }
  if (src.family === 'attachment') {
    familyPathSegment = '_attachments'
  }

  const modulePath = path.join('/', src.component, version, module)
  const dirname = path.join(modulePath, familyPathSegment, src.subpath, indexifyPathSegment)
  const outputPath = path.join(dirname, basename)
  const moduleRootPath = path.relative(dirname, modulePath) || '.'
  const rootPath = path.relative(dirname, '/') || '.'

  return {
    dirname,
    basename,
    path: outputPath,
    moduleRootPath,
    rootPath,
  }
}

function resolvePub (src, out, htmlExtensionStyle, siteUrl) {
  const urlSegments = out.path.split('/')
  const lastUrlSegmentIndex = urlSegments.length - 1

  // only change the URLs of pages
  if (src.family === 'page') {
    if (htmlExtensionStyle === 'drop') {
      if (urlSegments[lastUrlSegmentIndex] === 'index.html') {
        urlSegments[lastUrlSegmentIndex] = ''
      } else {
        urlSegments[lastUrlSegmentIndex] = urlSegments[lastUrlSegmentIndex].replace(/\..*$/, '')
      }
    }
    if (htmlExtensionStyle === 'indexify') {
      urlSegments[lastUrlSegmentIndex] = ''
    }
  }

  const url = urlSegments.join('/')

  return {
    url,
    absoluteUrl: siteUrl + url,
    // Do we really need that?
    rootPath: out.rootPath,
  }
}
