'use strict'

function shoutBlock () {
  this.onContext('paragraph')
  this.process((parent, reader) =>
    this.createBlock(parent, 'paragraph', reader.getLines().map((l) => l.toUpperCase())))
}

function register (registry) {
  registry.block('shout', shoutBlock)
}

module.exports = shoutBlock
module.exports.register = register
