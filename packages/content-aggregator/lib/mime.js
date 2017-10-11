'use strict'

const mime = require('mime-types')

mime.types['adoc'] = 'text/asciidoc'
mime.extensions['text/asciidoc'] = ['adoc']

module.exports = mime
