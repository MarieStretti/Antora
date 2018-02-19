const asciidoctor = require('asciidoctor.js')()

asciidoctor.Extensions.register(function () {
  this.postprocessor(function () {
    this.process((_, output) => output + '\n<p>Fin!</p>')
  })
})
