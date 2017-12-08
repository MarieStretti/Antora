'use strict'

const path = require('path')

const convertAsciiDocString = require('./asciidoctor')

const examplesdir = 'example$'
const partialsdir = 'partial$'

module.exports = async function convertDocument (file, customAttributes, catalog) {
  const options = {
    safe: 'safe',
    attributes: Object.assign(
      {
        // overridable attributes
        'source-highlighter': 'highlight.js',
        sectanchors: '',
        idprefix: '',
        idseparator: '-',
        icons: 'font',
      },
      customAttributes,
      {
        // fixed attributes
        docname: file.src.stem,
        docfile: file.path,
        docfilesuffix: file.src.extname,
        'env-site': '',
        imagesdir: file.out.moduleRootPath + '/_images',
        attachmentsdir: file.out.moduleRootPath + '/_attachments',
        examplesdir,
        partialsdir,
      }
    ),
  }

  const { attributes, htmlContents } = convertAsciiDocString(
    file.contents.toString(),
    options,
    (doc, target) => readInclude(file, catalog, target),
    (refId, text) => transformXref(file, refId, text, catalog)
  )

  file.contents = htmlContents
  file.asciidoc = { attributes }

  return Promise.resolve()
}

function readInclude (file, catalog, target) {
  const [targetFamily, ...targetPath] = target.split('/').filter((a) => a !== '')

  const findOptions = {
    component: file.src.component,
    version: file.src.version,
    module: file.src.module,
    subpath: targetPath.slice(0, -1).join('/'),
    basename: targetPath.slice(-1).join(''),
  }

  const include = { file: target, path: file.src.basename }

  if (targetFamily === examplesdir) {
    findOptions.family = 'example'
  } else if (targetFamily === partialsdir) {
    findOptions.family = 'partial'
  } else {
    // TODO log "Bad include"
    include.contents = `+include::${target}[]+`
    return include
  }

  const includeFile = catalog.getById(findOptions)
  if (includeFile == null) {
    // TODO log "Unknown include"
    include.contents = `+include::${target}[]+`
    return include
  }

  include.contents = includeFile.contents.toString()
  return include
}

function transformXref (file, xref, title, catalog) {
  const xrefSrc = getSourceFromXref(xref)

  if (xrefSrc == null) {
    // TODO log "Invalid xref"
    return `<a href="#">${xref}</a>`
  }

  const xrefFile = catalog.getById({
    component: xrefSrc.component || file.src.component,
    version: xrefSrc.version || file.src.version,
    module: xrefSrc.module || file.src.module,
    family: 'page',
    subpath: xrefSrc.subpath,
    basename: xrefSrc.basename,
  })

  if (xrefFile == null) {
    // TODO log "Unknown xref"
    return `<a href="#">${xref}</a>`
  }

  const { dir: urlBase } = path.parse(file.pub.url)
  const relativeUrl = path.relative(urlBase, xrefFile.pub.url)

  return `<a href="${relativeUrl}">${title}</a>`
}

const XREF_REGEX = /^(?:(.+?)@)?(?:(?:(.+?):)?(?:(.+?))?:)?(?:(.+)\/)?(.+?)(?:#(.+?))?$/

function getSourceFromXref (xref) {
  const matches = XREF_REGEX.exec(xref)
  if (!matches) {
    return null
  }

  const [, extractedVersion, component, extractedModule, subpath = '', stem, fragment] = matches

  let version = extractedVersion
  if (extractedVersion == null && component != null) {
    // if component is defined and version undefined, it implicitly means "master"
    version = 'master'
  }

  let module = extractedModule
  if ((component != null || version != null) && extractedModule == null) {
    // if component and/or version are defined and module undefined, it implicitly means "ROOT"
    module = 'ROOT'
  }

  return {
    component,
    version,
    module,
    family: 'page',
    subpath,
    mediaType: 'text/asciidoc',
    basename: stem + '.adoc',
    stem,
    extname: '.adoc',
    fragment,
  }
}
