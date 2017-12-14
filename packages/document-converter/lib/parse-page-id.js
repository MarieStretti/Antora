'use strict'

// matches pattern version@component:module:topic/page.adoc#fragment
// ex. 1.0@antora:playbook:ui/bundle.adoc#url
const PAGE_ID_RX = /^(?:([^@]+)@)?(?:(?:([^:]+):)?(?:([^:]+))?:)?(?:([^:]+)\/)?([^:]+?)(?:\.adoc)?(?:#(.+?))?$/
const PAGE_ID_RXG = { version: 1, component: 2, module: 3, subpath: 4, stem: 5, fragment: 6 }

/**
 * Parses a contextual page ID string into a file src object.
 *
 * Parses the specified contextual page ID string into a file src object. If a
 * context src object is provided, it will be used to populate the component,
 * version, and/or module properties if missing.
 *
 * * If a component is specified, but not a version, the version defaults to master.
 * * If a component is specified, but not a module, the module defaults to ROOT.
 *
 * @param {String} spec - the contextual page ID spec (e.g., version@component:module:topic/page#fragment)
 * @param {Object} ctx - the src context (optional)
 *
 * @return {Object} - the resolved file src object for this contextual page ID
 */
module.exports = (spec, ctx = {}) => {
  const match = spec.match(PAGE_ID_RX)
  if (!match) return

  let version = match[PAGE_ID_RXG.version]
  let component = match[PAGE_ID_RXG.component]
  let module = match[PAGE_ID_RXG.module]
  let subpath = match[PAGE_ID_RXG.subpath] || ''
  let stem = match[PAGE_ID_RXG.stem]
  let fragment = match[PAGE_ID_RXG.fragment]

  if (component) {
    // if a component is specified, but not a version, assume version is "master"
    if (!version) version = 'master'
    // if a component is specified, but not a module, assume module is "ROOT"
    if (!module) module = 'ROOT'
  }

  return {
    component: component || ctx.component,
    version: version || ctx.version,
    module: module || ctx.module,
    family: 'page',
    subpath,
    mediaType: 'text/asciidoc',
    basename: stem + '.adoc',
    stem,
    extname: '.adoc',
    fragment,
  }
}
