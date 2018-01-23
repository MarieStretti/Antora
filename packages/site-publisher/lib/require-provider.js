'use strict'

const path = require('path')

function createRequireProvider () {
  const requestCache = new Map()
  return (request, requireBase) => {
    let resolved = requestCache.get(request)
    if (!resolved) {
      if (path.isAbsolute(request)) {
        resolved = request
      } else if (request.charAt(0) === '.') {
        resolved = path.join(requireBase, request)
      } else {
        resolved = require.resolve(request, {
          paths: [path.join(requireBase, 'node_modules')].concat(require.resolve.paths('')),
        })
      }
      requestCache.set(request, resolved)
    }

    return require(resolved)
  }
}

module.exports = createRequireProvider
