'use strict'

const createIncludeProcessor = require('./include/create-include-processor')

/**
 * Create an extension registry instance that handles the include directive to work with Antora.
 *
 * @memberOf module:asciidoc-loader
 *
 * @param {Asciidoctor} asciidoctor - Asciidoctor API.
 * @param {Object} callbacks - Callback functions.
 * @param {Function} callbacks.onInclude - A function that resolves the target of an include.
 *
 * @returns {Registry} An instance of Asciidoctor's extension registry.
 */
function createExtensionRegistry (asciidoctor, callbacks) {
  const registry = asciidoctor.Extensions.create()
  registry.includeProcessor(createIncludeProcessor(callbacks.onInclude))
  return registry
}

module.exports = createExtensionRegistry
