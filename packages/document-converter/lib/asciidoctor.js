'use strict'

const asciidoctor = require('asciidoctor.js')()

const AsciidoctorIncludeProcessorExtension = require('./include-processor-extension')
const includeProcessor = new AsciidoctorIncludeProcessorExtension(asciidoctor)

const AsciidoctorXrefProcessorExtension = require('./xref-processor-extension')
const xrefProcessor = new AsciidoctorXrefProcessorExtension(asciidoctor)

module.exports = function (asciidoc, options, onInclude, onPageRef) {
  includeProcessor.onInclude(onInclude)
  xrefProcessor.onPageRef(onPageRef)
  const ast = asciidoctor.load(asciidoc, options)
  const attributes = ast.getAttributes()
  const html = ast.convert()
  const htmlContents = Buffer.from(html)
  return { attributes, htmlContents }
}
