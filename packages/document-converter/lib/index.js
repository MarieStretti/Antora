'use strict'

const loadAsciiDoc = require('@antora/asciidoc-loader')

module.exports = async function convertDocument (file, customAttrs, contentCatalog) {
  const doc = loadAsciiDoc(file, customAttrs, contentCatalog)
  const attributes = doc.getAttributes()
  // Q: should we backup the AsciiDoc contents for all pages? what's the impact?
  if ('page-partial' in attributes) {
    file.src.contents = file.contents
  }
  file.contents = Buffer.from(doc.convert())
  file.asciidoc = { attributes }
}
