'use strict'

const ConverterExtension = require('./xref/converter-extension')

/**
 * Creates an HTML5 converter instance with Antora enhancements.
 *
 * @memberof asciidoc-loader
 *
 * @param {Asciidoctor} asciidoctor - Asciidoctor API.
 * @param {Object} callbacks - Callback functions.
 * @param {Function} callbacks.onPageRef - A function that converts a page reference.
 *
 * @returns {Converter} An enhanced instance of Asciidoctor's HTML5 converter.
 */
function createConverter (asciidoctor, callbacks) {
  const converter = getConverterFactory(asciidoctor).$create('html5')
  converter.$extend(ConverterExtension)
  converter.$on_page_ref(callbacks.onPageRef)
  return converter
}

function getConverterFactory (asciidoctor) {
  return asciidoctor.$$const.Converter.$$const.Factory.$default(false)
}

module.exports = createConverter
