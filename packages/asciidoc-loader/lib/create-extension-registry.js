'use strict'

module.exports = (asciidoctor, callbacks) => {
  const registry = asciidoctor.Extensions.create()
  registry.includeProcessor(function () {
    this.handles((target) => !!callbacks.onInclude)
    this.process((doc, reader, target, attrs) => {
      const resolvedFile = callbacks.onInclude(doc, target, doc.reader.getCursor())
      if (resolvedFile) reader.pushInclude(resolvedFile.contents, resolvedFile.file, resolvedFile.path, 1, attrs)
    })
  })
  return registry
}
