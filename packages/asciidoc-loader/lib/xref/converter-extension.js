'use strict'

const $pageRefCallback = Symbol('pageRefCallback')

const XrefConverterExtension = (() => {
  // TODO nest module in Antora module
  const module = Opal.module(undefined, 'XrefConverterExtension')
  Opal.defn(module, '$inline_anchor', function inlineAnchor (node) {
    if (node.getType() === 'xref') {
      // NOTE refid is undefined if document is self-referencing
      let refSpec = node.getAttribute('refid')
      if (
        node.getAttribute('path') ||
        (refSpec && refSpec.endsWith('.adoc') && (refSpec = refSpec.slice(0, -5)) !== undefined)
      ) {
        const content = node.getText()
        const callback = this[$pageRefCallback]
        if (callback) return callback(refSpec, content === undefined ? refSpec : content)
      }
    }
    return Opal.send(this, Opal.find_super_dispatcher(this, 'inline_anchor', inlineAnchor), [node], null)
  })
  Opal.defn(module, '$on_page_ref', function (callback) {
    this[$pageRefCallback] = callback
  })
  return module
})()

module.exports = XrefConverterExtension
