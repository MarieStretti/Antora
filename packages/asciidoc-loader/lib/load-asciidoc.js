'use strict'

const asciidoctor = require('asciidoctor.js')()
const convertPageRef = require('./xref/convert-page-ref')
const createConverter = require('./create-converter')
const createExtensionRegistry = require('./create-extension-registry')
const path = require('path')
const resolveIncludeFile = require('./include/resolve-include-file')

const { EXAMPLES_DIR_PROXY, PARTIALS_DIR_PROXY } = require('./constants')

/**
 * Loads the AsciiDoc source from the specified file into a Document object.
 *
 * Uses the Asciidoctor.js load API to parse the source of the specified file
 * into an Asciidoctor Document object. Sets options and attributes that
 * provide integration with the Antora environment. The options include a
 * custom converter and extension registery to handle page references and
 * include directives, respectively. It also assigns attributes that provide
 * context either for the author (e.g., env=site) or the pipeline (e.g.,
 * docfile).
 *
 * @memberof asciidoc-loader
 *
 * @param {File} file - The virtual file the contains AsciiDoc source contents.
 * @param {Object} [customAttrs={}] - Custom attributes to assign on the AsciiDoc document.
 * @param {ContentCatalog} [contentCatalog=undefined] - The content catalog
 *   that provides access to the virtual files in the site.
 * @param {Object} [opts={}] - Additional processing options.
 * @param {Boolean} [opts.relativizePageRefs=true] - Configures processor to generate
 *   page references relative to the current page instead of the site root.
 *
 * @returns {Document} An Asciidoctor Document object created from the specified source.
 */
function loadAsciiDoc (file, customAttrs = {}, contentCatalog = undefined, opts = {}) {
  const envAttrs = {
    env: 'site',
    'env-site': '',
    'site-gen': 'antora',
    'site-gen-antora': '',
  }
  const defaultAttrs = {
    'attribute-missing': 'warn',
    'data-uri': null,
    icons: 'font',
    sectanchors: '',
    'source-highlighter': 'highlight.js',
  }
  const builtinAttrs = {
    docname: file.src.stem,
    docfile: file.path,
    // NOTE docdir implicitly sets base_dir on document
    // NOTE Opal only expands to absolute path if value begins with ./
    docdir: file.dirname,
    docfilesuffix: file.src.extname,
    imagesdir: path.join(file.pub.moduleRootPath, '_images'),
    attachmentsdir: path.join(file.pub.moduleRootPath, '_attachments'),
    examplesdir: EXAMPLES_DIR_PROXY,
    partialsdir: PARTIALS_DIR_PROXY,
  }
  const attributes = Object.assign(envAttrs, defaultAttrs, customAttrs || {}, builtinAttrs)
  const relativizePageRefs = opts.relativizePageRefs !== false
  const converter = createConverter(asciidoctor, {
    onPageRef: (refSpec, content) => convertPageRef(refSpec, content, file, contentCatalog, relativizePageRefs),
  })
  const extensionRegistry = createExtensionRegistry(asciidoctor, {
    onInclude: (doc, target, cursor) => resolveIncludeFile(target, file, cursor, contentCatalog),
  })
  const options = {
    attributes,
    converter,
    extension_registry: extensionRegistry,
    safe: 'safe',
  }
  return asciidoctor.load(file.contents.toString(), options)
}

module.exports = loadAsciiDoc
