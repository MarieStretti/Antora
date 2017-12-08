'use strict'

const $pageRefHandler = Symbol('pageRefHandler')

module.exports = class AsciidoctorXrefProcessorExtension {
  constructor (asciidoctor) {
    const thisExtension = this
    const Html5Converter = global.Opal.klass(asciidoctor.$$const.Converter, null, 'Html5Converter', () => {})

    global.Opal.alias(Html5Converter, 'super_inline_anchor', 'inline_anchor')

    global.Opal.defn(Html5Converter, '$inline_anchor', function (node) {
      if (node.getType() === 'xref') {
        // NOTE refId is undefined if document is self-referencing
        let refId = node.getAttribute('refid')
        if (
          node.getAttribute('path') ||
          (refId && refId.endsWith('.adoc') && (refId = refId.slice(0, -5)) !== undefined)
        ) {
          let text
          text = (text = node.getText()) === undefined ? refId : text
          return thisExtension[$pageRefHandler](refId, text)
        }
      }
      return this.$super_inline_anchor(node)
    })
  }

  onPageRef (callback) {
    this[$pageRefHandler] = callback
  }
}
