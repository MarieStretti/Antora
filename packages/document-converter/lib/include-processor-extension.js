'use strict'

const $$includeHandler = Symbol('$$includeHandler')

module.exports = class AsciidoctorIncludeProcessorExtension {
  constructor (asciidoctor) {
    const thisExtension = this
    const Extensions = asciidoctor.Extensions

    Extensions.register(function () {
      this.includeProcessor(function () {
        this.process((doc, reader, target, attributes) => {
          const processCallback = thisExtension[$$includeHandler]
          if (!processCallback) {
            return
          }
          const include = processCallback(doc, target, doc.reader.$cursor())
          if (include != null) {
            reader.$push_include(include.contents, include.file, include.path, 1, attributes)
          }
        })
      })
    })

    this[$$includeHandler] = null
  }

  onInclude (callback) {
    this[$$includeHandler] = callback
  }
}
