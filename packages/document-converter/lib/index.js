'use strict'

const path = require('path')

const convertAsciiDocString = require('./asciidoctor')
const resolvePageRef = require('./resolve-page-ref')

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
    (pageId, content) => convertPageRef(file, pageId, content, catalog)
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

function convertPageRef (file, pageId, content, catalog) {
  let targetPage, fragment
  try {
    ({ page: targetPage, fragment } = resolvePageRef(pageId, catalog, file.src))
    if (!targetPage) {
      // TODO log "Unresolved page ID"
      return `<a href="#">${pageId}</a>`
    }
  } catch (e) {
    // TODO log "Invalid page ID syntax" (or e.message)
    return `<a href="#">${pageId}</a>`
  }

  // FIXME parsing the URL is really ugly; find a better way!
  const { dir: urlBase } = path.parse(file.pub.url)
  let targetUrl = path.relative(urlBase, targetPage.pub.url)
  if (fragment) targetUrl = targetUrl + '#' + fragment

  return `<a href="${targetUrl}">${content}</a>`
}
