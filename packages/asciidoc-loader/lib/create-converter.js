'use strict'

const $pageRefCallback = Symbol('pageRefCallback')

const XrefConverterExtension = ((Opal) => {
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
})(global.Opal)

/**
 * Creates an HTML5 converter instance with Antora enhancements.
 *
 * @memberOf module:asciidoc-loader
 *
 * @param {Asciidoctor} asciidoctor - Asciidoctor API.
 * @param {Object} callbacks - Callback functions.
 * @param {Function} callbacks.onPageRef - A function that converts a page reference.
 *
 * @returns {Converter} An enhanced instance of Asciidoctor's HTML5 converter.
 */
function createConverter (asciidoctor, callbacks) {
  const converter = getConverterFactory(asciidoctor).$create('html5')
  converter.$extend(XrefConverterExtension)
  converter.$on_page_ref(callbacks.onPageRef)
  return converter
}

function getConverterFactory (asciidoctor) {
  return asciidoctor.$$const.Converter.$$const.Factory.$default(false)
}

module.exports = createConverter
