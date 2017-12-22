'use strict'

const loadAsciiDoc = require('@antora/asciidoc-loader')

module.exports = async function convertDocument (file, customAttrs, contentCatalog) {
  const doc = loadAsciiDoc(file, customAttrs, contentCatalog)
  file.asciidoc = { attributes: doc.getAttributes() }
  file.contents = Buffer.from(doc.convert())
}
