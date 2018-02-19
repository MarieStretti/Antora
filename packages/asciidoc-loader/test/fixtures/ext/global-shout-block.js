'use strict'

function shoutBlock () {
  this.onContext('paragraph')
  this.process((parent, reader) =>
    this.createBlock(parent, 'paragraph', reader.getLines().map((l) => l.toUpperCase())))
}

function ShoutBlockExtension () {
  this.block('shout', shoutBlock)
}

module.exports = ShoutBlockExtension
