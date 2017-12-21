'use strict'

const path = require('path')
const splitOnce = require('../util/split-once')

const { EXAMPLES_DIR_PROXY, PARTIALS_DIR_PROXY } = require('../constants')

/**
 * Resolves the specified include target to a virtual file in the content catalog.
 *
 * @memberOf module:asciidoc-loader
 *
 * @param {String} target - The target of the include directive to resolve.
 * @param {File} file - The outermost virtual file from which the include originated (not
 *   necessarily the current file).
 * @param {Cursor} cursor - The cursor of the reader for file that contains the include directive.
 * @param {ContentCatalog} catalog - The content catalog that contains the virtual files in the site.
 * @returns {Object} A map containing the file, path, and contents of the resolved file.
 */
function resolveIncludeFile (target, file, cursor, catalog) {
  let [targetFamily, targetPath] = splitOnce(target, '/')
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
    resolvedIncludeFile = catalog.getById({
      component: file.src.component,
      version: file.src.version,
      module: file.src.module,
      family: targetFamily,
      subpath: targetPathParts.dir,
      basename: targetPathParts.base,
    })
  } else {
    // TODO can we keep track of the virtual file we're currently in instead of relying on cursor.dir?
    resolvedIncludeFile = catalog.getByPath({
      component: file.src.component,
      version: file.src.version,
      path: path.join(cursor.dir, targetPath),
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

module.exports = resolveIncludeFile
