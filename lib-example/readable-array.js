'use strict'

const { Readable } = require('stream')

class ReadableArray extends Readable {
  constructor (array) {
    super({ objectMode: true })
    this.array = array.slice(0)
  }

  _read (size) {
    const read = this.array.splice(0, size)
    while (read.length) this.push(read.shift())
    if (!this.array.length) this.push(null)
  }
}

module.exports = ReadableArray
