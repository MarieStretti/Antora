'use strict'

// IMPORTANT eagerly load Opal to force the String encoding from UTF-16LE to UTF-8
const Opal = require('opal-runtime').Opal
if ('encoding' in String.prototype && String(String.prototype.encoding) !== 'UTF-8') {
  String.prototype.encoding = Opal.const_get_local(Opal.const_get_qualified('::', 'Encoding'), 'UTF_8') // eslint-disable-line
}

const asciidoctor = require('asciidoctor.js')()
const convertPageRef = require('./xref/convert-page-ref')
const createConverter = require('./create-converter')
const createExtensionRegistry = require('./create-extension-registry')
const ospath = require('path')
const { posix: path } = ospath
const resolveIncludeFile = require('./include/resolve-include-file')

const { EXAMPLES_DIR_PROXY, PARTIALS_DIR_PROXY } = require('./constants')

/**
 * Loads the AsciiDoc source from the specified file into a Document object.
 *
 * Uses the Asciidoctor.js load API to parse the source of the file into an Asciidoctor Document object. Sets options
 * and attributes that provide integration with the Antora environment. Options include a custom converter and extension
 * registry to handle page references and include directives, respectively. It also assigns attributes that provide
 * context either for the author (e.g., env=site) or pipeline (e.g., docfile).
 *
 * @memberof asciidoc-loader
 *
 * @param {File} file - The virtual file whose contents is an AsciiDoc source document.
 * @param {ContentCatalog} [contentCatalog=undefined] - The catalog of all virtual content files in the site.
 * @param {Object} [config={}] - AsciiDoc processor configuration options.
 * @param {Object} [config.attributes={}] - Shared AsciiDoc attributes to assign to the document.
 * @param {Array<Function>} [config.extensions=[]] - Self-registering AsciiDoc processor extension functions.
 * @param {Boolean} [config.relativizePageRefs=true] - Configures the AsciiDoc processor to generate relative page
 *   references (relative to the current page) instead of root relative (relative to the site root).
 *
 * @returns {Document} An Asciidoctor Document object created from the source of the specified file.
 */
function loadAsciiDoc (file, contentCatalog = undefined, config = {}) {
  if (!config) config = {}
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
  const intrinsicAttrs = {
    docname: file.src.stem,
    docfile: file.path,
    // NOTE docdir implicitly sets base_dir on document; Opal only expands value to absolute path if it starts with ./
    docdir: file.dirname,
    docfilesuffix: file.src.extname,
    imagesdir: path.join(file.pub.moduleRootPath, '_images'),
    attachmentsdir: path.join(file.pub.moduleRootPath, '_attachments'),
    examplesdir: EXAMPLES_DIR_PROXY,
    partialsdir: PARTIALS_DIR_PROXY,
  }
  const attributes = Object.assign({}, envAttrs, defaultAttrs, config.attributes, intrinsicAttrs)
  const relativizePageRefs = config.relativizePageRefs !== false
  const converter = createConverter(asciidoctor, {
    onPageRef: (refSpec, content) => convertPageRef(refSpec, content, file, contentCatalog, relativizePageRefs),
  })
  const extensionRegistry = createExtensionRegistry(asciidoctor, {
    onInclude: (doc, target, cursor) => resolveIncludeFile(target, file, cursor, contentCatalog),
  })
  if (config.extensions && config.extensions.length) {
    config.extensions.forEach((extension) => extension.register(extensionRegistry))
  }
  return asciidoctor.load(file.contents.toString(), {
    attributes,
    converter,
    extension_registry: extensionRegistry,
    safe: 'safe',
  })
}

/**
 * Resolves a global AsciiDoc configuration object from data in the playbook.
 *
 * Reads data from the asciidoc category of the playbook and resolves it into a global AsciiDoc configuration object
 * that can be used by the loadAsciiDoc function. This configuration object is a shallow clone of the data in the
 * playbook. The main purpose of this function is to resolve extension references in the playbook to extension
 * functions. If the extension is scoped, the function is stored in this object. If the extension is global, it is
 * registered with the global extension registry, then discarded.
 *
 * @memberof asciidoc-loader
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.asciidoc - The AsciiDoc configuration data in the playbook.
 *
 * @returns {Object} A resolved configuration object to be used by the loadAsciiDoc function.
 */
function resolveConfig (playbook) {
  if (!playbook.asciidoc) return {}
  const config = Object.assign({}, playbook.asciidoc)
  // TODO process !name attributes
  if (config.extensions && config.extensions.length) {
    const extensions = config.extensions.reduce((accum, extensionPath) => {
      if (extensionPath.charAt() === '.') {
        extensionPath = ospath.resolve(playbook.dir, extensionPath)
      } else if (!ospath.isAbsolute(extensionPath)) {
        const localNodeModulesPath = ospath.resolve(playbook.dir, 'node_modules')
        const paths = require.resolve.paths('').filter((requirePath) => requirePath !== localNodeModulesPath)
        paths.unshift(localNodeModulesPath)
        extensionPath = require.resolve(extensionPath, { paths })
      }
      const extension = require(extensionPath)
      if ('register' in extension) {
        accum.push(extension)
      } else if (!isExtensionRegistered(extension, asciidoctor.Extensions)) {
        // QUESTION should we assign an antora-specific group name?
        asciidoctor.Extensions.register(extension)
      }
      return accum
    }, [])
    if (extensions.length) {
      config.extensions = extensions
    } else {
      delete config.extensions
    }
  } else {
    delete config.extensions
  }
  return config
}

function isExtensionRegistered (ext, registry) {
  return (
    registry.groups &&
    global.Opal.hash(registry.groups)
      .$values()
      .includes(ext)
  )
}

module.exports = loadAsciiDoc
module.exports.resolveConfig = resolveConfig
