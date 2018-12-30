'use strict'

process.env.NODE_ENV = 'test'

// IMPORTANT eagerly load Opal since we'll always be in this context; change String encoding from UTF-16LE to UTF-8
const { Opal } = require('opal-runtime')
if ('encoding' in String.prototype && String(String.prototype.encoding) !== 'UTF-8') {
  String.prototype.encoding = Opal.const_get_local(Opal.const_get_qualified('::', 'Encoding'), 'UTF_8') // eslint-disable-line
}

const chai = require('chai')
const fs = require('fs-extra')
const { obj: map } = require('through2')

chai.use(require('chai-fs'))
chai.use(require('chai-cheerio'))
chai.use(require('chai-spies'))
// dirty-chai must be loaded after the other plugins
// see https://github.com/prodatakey/dirty-chai#plugin-assertions
chai.use(require('dirty-chai'))

module.exports = {
  bufferizeContents: () => map((file, enc, next) => {
    if (file.isStream()) {
      const data = []
      const readChunk = (chunk) => data.push(chunk)
      const stream = file.contents
      stream.on('data', readChunk)
      stream.once('end', () => {
        stream.removeListener('data', readChunk)
        file.contents = Buffer.concat(data)
        next(null, file)
      })
    } else {
      next(null, file)
    }
  }),
  deferExceptions: async (fn, ...args) => {
    let deferredFn
    try {
      const result = await fn(...args)
      deferredFn = () => result
    } catch (err) {
      deferredFn = () => {
        throw err
      }
    }
    return deferredFn
  },
  expect: chai.expect,
  expectCalledWith: (observed, args, i = 0) => {
    if (!Array.isArray(args)) args = [args]
    chai
      .expect(observed)
      .on.nth(i)
      .called.with(...args)
  },
  heredoc: (literals, ...values) => {
    const str =
      literals.length > 1
        ? values.reduce((accum, value, idx) => accum + value + literals[idx + 1], literals[0])
        : literals[0]
    const lines = str.trimRight().split(/^/m)
    if (lines.length > 1) {
      if (lines[0] === '\n') lines.shift()
    } else {
      return str
    }
    const indentRx = /^ +/
    const indentSize = Math.min(...lines.filter((l) => l.startsWith(' ')).map((l) => l.match(indentRx)[0].length))
    return (indentSize ? lines.map((l) => (l.startsWith(' ') ? l.substr(indentSize) : l)) : lines).join('')
  },
  removeSyncForce: (p, timeout = 5000) => {
    // NOTE remove can fail multiple times on Windows, so try, try again
    if (process.platform === 'win32') {
      const start = Date.now()
      let retry = true
      while (retry) {
        try {
          fs.removeSync(p)
          retry = false
        } catch (err) {
          if (Date.now() - start > timeout) throw err
        }
      }
    } else {
      fs.removeSync(p)
    }
  },
  spy: chai.spy,
}
