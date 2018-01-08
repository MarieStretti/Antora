'use strict'

// IMPORTANT nodegit must be loaded before asciidoctor.js or else promisify gets tripped up by Opal enhancements
require('nodegit')

const interceptRequire = require('intercept-require')
const patchChai = (_, info) => {
  if (
    info.moduleId.endsWith('/getEnumerableProperties') &&
    (info.absPath || `/node_modules/${info.moduleId}`).endsWith(
      '/node_modules/chai/lib/chai/utils/getEnumerableProperties.js'
    )
  ) {
    return (obj) => {
      const props = []
      for (let prop in obj) {
        if (!prop.startsWith('$')) props.push(prop)
      }
      return props
    }
  }
}
const uninterceptRequire = interceptRequire(patchChai)
const chai = require('chai')
uninterceptRequire()

chai.use(require('chai-fs'))
chai.use(require('chai-as-promised'))
chai.use(require('chai-cheerio'))
chai.use(require('chai-spies-next'))
// dirty-chai must be loaded after the other plugins
// see https://github.com/prodatakey/dirty-chai#plugin-assertions
chai.use(require('dirty-chai'))

module.exports = {
  expect: chai.expect,
  spy: chai.spy,
  expectCalledWith: (observed, args, i = 0) =>
    chai
      .expect(observed.__spy.calls[i])
      .to.eql(Array.isArray(args) ? args : [args], 'expected ' + observed + ' to have been called with args'),
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
}
