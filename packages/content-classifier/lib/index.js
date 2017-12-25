'use strict'

const path = require('path')
const _ = require('lodash')

const $files = Symbol('files')
const $generateId = Symbol('generateId')

class ContentCatalog {
  constructor () {
    this[$files] = {}
  }

  getFiles () {
    return Object.values(this[$files])
  }

  addFile (file) {
    const id = this[$generateId](_.pick(file.src, 'component', 'version', 'module', 'family', 'relative'))
    if (id in this[$files]) {
      throw new Error('Duplicate file')
    }
    this[$files][id] = file
  }

  findBy (options) {
    const srcFilter = _.pick(options, ['component', 'version', 'module', 'family', 'relative', 'basename', 'extname'])
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

module.exports = (playbook, aggregate) => {
  const catalog = new ContentCatalog()

  aggregate.forEach(({ name, title, version, nav, files }) => {
    files.forEach((file) => {
      const pathSegments = file.path.split('/')
      partitionSrc(file, pathSegments, nav)

      if (file.src.family == null) {
        return
      }

      file.src.component = name
      file.src.version = version
      // FIXME this assignment breaks if navigation file is not in modules folder
      file.src.module = pathSegments[1]

      const topicDirs = pathSegments.slice(2, -1)
      if (topicDirs.length) {
        file.src.moduleRootPath = Array(topicDirs.length)
          .fill('..')
          .join('/')
      } else {
        file.src.moduleRootPath = '.'
      }

      file.out = resolveOut(file.src, playbook.urls.htmlExtensionStyle)
      file.pub = resolvePub(file.src, file.out, playbook.urls.htmlExtensionStyle, playbook.site.url)

      // maybe addFile() should be "really" public and handle all the stuff above
      catalog.addFile(file)
    })
  })

  return catalog
}

function partitionSrc (file, pathSegments, nav) {
  const navInfo = nav ? getNavInfo(file, nav) : undefined
  if (navInfo) {
    file.src.family = 'navigation'
    // relative from modules/<module>
    // FIXME don't assume navigation is in module folder
    file.src.relative = pathSegments.slice(2).join('/')
    file.nav = navInfo
  } else if (pathSegments[0] === 'modules') {
    if (pathSegments[2] === 'pages') {
      if (pathSegments[3] === '_partials') {
        // QUESTION should this family be partial-page instead?
        file.src.family = 'partial'
        // relative from modules/<module>/pages/_partials
        file.src.relative = pathSegments.slice(4).join('/')
      } else if (file.src.mediaType === 'text/asciidoc' && file.src.basename !== '_attributes.adoc') {
        file.src.family = 'page'
        // relative from modules/<module>/pages
        file.src.relative = pathSegments.slice(3).join('/')
      }
    } else if (pathSegments[2] === 'assets') {
      if (pathSegments[3] === 'images') {
        file.src.family = 'image'
        // relative from modules/<module>/assets/images
        file.src.relative = pathSegments.slice(4).join('/')
      } else if (pathSegments[3] === 'attachments') {
        file.src.family = 'attachment'
        // relative from modules/<module>/assets/attachments
        file.src.relative = pathSegments.slice(4).join('/')
      }
    } else if (pathSegments[2] === 'examples') {
      file.src.family = 'example'
      // relative from modules/<module>/examples
      file.src.relative = pathSegments.slice(3).join('/')
    }
  }
}

/**
 * Return navigation properties if this file is registered as a navigation file.
 *
 * @param {File} file - the virtual file to check.
 * @param {Array} nav - the array of navigation entries from the component descriptor.
 *
 * @return {Object} - an object of properties that includes the navigation index, if this file is
 * a navigation file, or undefined if it's not.
 */
function getNavInfo (file, nav) {
  const index = nav.findIndex((candidate) => candidate === file.path)
  if (index !== -1) return { index }
}

function resolveOut (src, htmlExtensionStyle = 'default') {
  const version = src.version === 'master' ? '' : src.version
  const module = src.module === 'ROOT' ? '' : src.module

  let basename = src.basename
  if (src.mediaType === 'text/asciidoc') basename = src.stem + '.html'

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

  const modulePath = path.join(src.component, version, module)
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
    } else if (htmlExtensionStyle === 'indexify') {
      urlSegments[lastUrlSegmentIndex] = ''
    }
  }

  const url = '/' + urlSegments.join('/')

  return {
    url,
    absoluteUrl: siteUrl + url,
    // Q: do we need root paths since they just match values on out?
    moduleRootPath: out.moduleRootPath,
    rootPath: out.rootPath,
  }
}
