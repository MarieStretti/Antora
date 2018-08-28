'use strict'

const { posix: path } = require('path')
const splitOnce = require('../util/split-once')

const { EXAMPLES_DIR_TOKEN, PARTIALS_DIR_TOKEN } = require('../constants')

/**
 * Resolves the specified include target to a virtual file in the content catalog.
 *
 * @memberof asciidoc-loader
 *
 * @param {String} target - The target of the include directive to resolve.
 * @param {File} page - The outermost virtual file from which the include originated (not
 *   necessarily the current file).
 * @param {Cursor} cursor - The cursor of the reader for file that contains the include directive.
 * @param {ContentCatalog} catalog - The content catalog that contains the virtual files in the site.
 * @returns {Object} A map containing the file, path, and contents of the resolved file.
 */
function resolveIncludeFile (target, page, cursor, catalog) {
  const ctx = (cursor.file || {}).context || page.src
  let resolved
  let family
  let relative
  let placeholder
  if (~target.indexOf('$')) {
    if (target.startsWith(PARTIALS_DIR_TOKEN) || target.startsWith(EXAMPLES_DIR_TOKEN)) {
      ;[family, relative] = splitOnce(target, '$')
      if (relative.charAt() === '/') {
        relative = relative.substr(1)
        placeholder = true
      }
      resolved = catalog.getById({
        component: ctx.component,
        version: ctx.version,
        module: ctx.module,
        family,
        relative,
      })
    } else {
      resolved = catalog.resolveResource(target, { component: ctx.component, version: ctx.version, module: ctx.module })
    }
  } else {
    resolved = catalog.getByPath({
      component: ctx.component,
      version: ctx.version,
      // QUESTION does cursor.dir always contain the value we expect?
      path: path.join(cursor.dir.toString(), target),
    })
  }
  if (resolved) {
    const resolvedSrc = resolved.src
    return {
      context: resolvedSrc,
      file: resolvedSrc.path,
      path: resolvedSrc.basename,
      // NOTE src.contents is set if page is marked as a partial
      // TODO if include file is a page, warn if not marked as a partial
      contents: (resolvedSrc.contents || resolved.contents).toString(),
    }
  } else {
    // FIXME use replace next line instead of pushing an include; maybe raise error
    // TODO log "Unresolved include"
    return {
      context: cursor.dir.context,
      file: cursor.file,
      contents: `+include::${placeholder ? '{' + family + 'sdir}/' + relative : target}[]+`,
    }
  }
}

module.exports = resolveIncludeFile
