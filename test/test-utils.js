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

chai.use(require('chai-as-promised'))
chai.use(require('chai-spies-next'))
// dirty-chai must be loaded after the other plugins
// see https://github.com/prodatakey/dirty-chai#plugin-assertions
chai.use(require('dirty-chai'))

module.exports = {
  expect: chai.expect,
  spy: chai.spy,
}
