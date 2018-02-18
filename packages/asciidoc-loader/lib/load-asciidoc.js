'use strict'

// IMPORTANT eagerly load Opal to change the String encoding from UTF-16LE to UTF-8
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
