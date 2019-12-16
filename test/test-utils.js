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
chai.Assertion.addMethod('endWith', function (expected) {
  const subject = this._obj
  let verdict = false
  if (typeof subject === 'string' && typeof expected === 'string') verdict = subject.endsWith(expected)
  return this.assert(
    verdict,
    'expected #{this} to end with #{exp}',
    'expected #{this} to not end with #{exp}',
    expected,
    undefined
  )
})

module.exports = {
  bufferizeContents: () =>
    map((file, enc, next) => {
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
  captureStdErr: async (fn, ...args) => {
    const stdErrWrite = process.stderr.write
    const messages = []
    try {
      process.stderr.write = (msg) => messages.push(msg.trim())
      await fn(...args)
      return messages
    } finally {
      process.stderr.write = stdErrWrite
    }
  },
  captureStdErrSync: (fn, ...args) => {
    const stdErrWrite = process.stderr.write
    const messages = []
    try {
      process.stderr.write = (msg) => messages.push(msg.trim())
      fn(...args)
      return messages
    } finally {
      process.stderr.write = stdErrWrite
    }
  },
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
