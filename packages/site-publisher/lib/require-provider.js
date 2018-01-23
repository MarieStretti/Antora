'use strict'

const path = require('path')

function createRequireProvider () {
  const keyCache = new Map()
  const objectCache = new WeakMap()
  return (request, requireBase) => {
    let objectKey = keyCache.get(request)
    let previouslyCached
    if (objectKey) {
      previouslyCached = true
    } else {
      if (!requireBase || path.isAbsolute(request)) {
        objectKey = { request }
      } else if (request.charAt(0) === '.') {
        objectKey = { request: path.join(requireBase, request) }
      } else {
        objectKey = { request: path.join(requireBase, 'node_modules', request) }
      }
      keyCache.set(request, objectKey)
    }

    if (previouslyCached && objectCache.has(objectKey)) {
      return objectCache.get(objectKey)
    } else {
      const object = require(objectKey.request)
      objectCache.set(objectKey, object)
      return object
    }
  }
}

module.exports = createRequireProvider
