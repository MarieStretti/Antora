/**
 * AsciiDoc Loader Component
 *
 * @module asciidoc-loader
 */
'use strict'

const asciidoctor = require('asciidoctor.js')()
const createConverter = require('./create-converter')
const createExtensionRegistry = require('./create-extension-registry')
const computeRelativeUrlPath = require('./util/compute-relative-url-path')
const path = require('path')
const resolvePage = require('./xref/resolve-page')

const EXAMPLES_DIR_PROXY = 'example$'
const PARTIALS_DIR_PROXY = 'partial$'

/**
 * Load the AsciiDoc source from the specified file into a Document object.
 *
 * Uses the Asciidoctor.js load API to parse the source of the specified file
 * into an Asciidoctor Document object. Sets options and attributes that
 * provide integration with the Antora environment. The options include a
 * custom converter and extension registery to handle page references and
 * include directives, respectively. It also assigns attributes that provide
 * context either for the author (e.g., env=site) or the pipeline (e.g.,
 * docfile).
 *
 * @memberOf module:asciidoc-loader
 *
 * @param {File} file - The virtual file the contains AsciiDoc source contents.
 * @param {Object} [customAttrs={}] - Custom attributes to assign on the AsciiDoc document.
 * @param {ContentCatalog} [contentCatalog=undefined] - The content catalog
 *   that provides access to the virtual files in the site.
 *
 * @returns {Document} An Asciidoctor Document object created from the specified source.
 */
function loadAsciiDoc (file, customAttrs = {}, contentCatalog = undefined) {
  const envAttrs = {
    env: 'site',
    'env-site': '',
    'site-gen': 'antora',
    'site-gen-antora': '',
  }
  const defaultAttrs = {
    'attribute-missing': 'warn',
    icons: 'font',
    sectanchors: '',
    'source-highlighter': 'highlight.js',
  }
  const builtinAttrs = {
    docname: file.src.stem,
    docfile: file.path,
    // Q: should docfilesuffix be file.extname instead?
    docfilesuffix: file.src.extname,
    imagesdir: file.pub.moduleRootPath + '/_images',
    attachmentsdir: file.pub.moduleRootPath + '/_attachments',
    examplesdir: EXAMPLES_DIR_PROXY,
    partialsdir: PARTIALS_DIR_PROXY,
  }
  const attributes = Object.assign(envAttrs, defaultAttrs, customAttrs || {}, builtinAttrs)
  const converter = createConverter(asciidoctor, {
    onPageRef: (refSpec, content) => convertPageRef(refSpec, content, file, contentCatalog),
  })
  const extReg = createExtensionRegistry(asciidoctor, {
    onInclude: (doc, target, cursor) => resolveIncludeFile(target, file, cursor, contentCatalog),
  })
  const options = {
    attributes,
    converter,
    extension_registry: extReg,
    safe: 'safe',
  }
  return asciidoctor.load(file.contents.toString(), options)
}

// TODO is there a way to keep track of the virtual file we're currently in? (hijack cursor?)
function resolveIncludeFile (target, file, cursor, contentCatalog) {
  let [targetFamily, targetPath] = splitFirst(target, '/')
  if (targetFamily === PARTIALS_DIR_PROXY) {
    targetFamily = 'partial'
  } else if (targetFamily === EXAMPLES_DIR_PROXY) {
    targetFamily = 'example'
  } else {
    targetFamily = undefined
    targetPath = target
  }

  let resolvedIncludeFile
  if (targetFamily) {
    const targetPathParts = path.parse(targetPath)
    resolvedIncludeFile = contentCatalog.getById({
      component: file.src.component,
      version: file.src.version,
      module: file.src.module,
      family: targetFamily,
      subpath: targetPathParts.dir,
      basename: targetPathParts.base,
    })
  } else {
    // NOTE if cursor.dir is absolute, this is a top-level include
    const basedir = path.isAbsolute(cursor.dir) ? path.dirname(file.path) : cursor.dir
    resolvedIncludeFile = contentCatalog.getByPath({
      component: file.src.component,
      version: file.src.version,
      path: path.join(basedir, targetPath),
    })
  }

  if (resolvedIncludeFile) {
    return {
      file: resolvedIncludeFile.path,
      path: resolvedIncludeFile.src.basename,
      contents: resolvedIncludeFile.contents.toString(),
    }
  } else {
    if (targetFamily) target = `{${targetFamily}sdir}/${targetPath}`
    // FIXME use replace next line instead of pushing an include; maybe raise error
    // TODO log "Unresolved include"
    return {
      file: cursor.file,
      path: cursor.path,
      contents: `+include::${target}[]+`,
    }
  }
}

function convertPageRef (refSpec, content, currentPage, contentCatalog) {
  let targetPage
  const [pageIdSpec, fragment] = splitFirst(refSpec, '#')
  try {
    if (!(targetPage = resolvePage(pageIdSpec, contentCatalog, currentPage.src))) {
      // TODO log "Unresolved page ID"
      return `<a href="#">${pageIdSpec}.adoc${fragment ? '#' + fragment : ''}</a>`
    }
  } catch (e) {
    // TODO log "Invalid page ID syntax" (or e.message)
    return `<a href="#">${refSpec}</a>`
  }

  let targetUrl = computeRelativeUrlPath(currentPage.pub.url, targetPage.pub.url)
  if (fragment) targetUrl = targetUrl + '#' + fragment

  return `<a href="${targetUrl}">${content}</a>`
}

function splitFirst (string, separator) {
  const separatorIdx = string.indexOf(separator)
  return separatorIdx === -1 ? [string] : [string.slice(0, separatorIdx), string.slice(separatorIdx + 1)]
}

module.exports = loadAsciiDoc
