'use strict'

// This file is mainly present to be used by reference unit tests

const map = require('map-stream')

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1).toLowerCase()
}

function capitalizeArray(array) {
  return array.map((text) => capitalize(text))
}

function capitalizeKeys(object) {
  const result = {}
  Object.entries(object).forEach(([key, value]) => {
    result[capitalize(key)] = value
  })
  return result
}

function asyncCapitalize(text) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (text == null) {
        return reject(new TypeError('null cannot be capitalized'))
      }
      resolve(capitalize(text))
    }, 10)
  })
}

function capitalizeStream() {
  return map((text, next) => {
    if (typeof text !== 'string') {
      return next(new TypeError('cannot capitalized a non String'))
    }
    next(null, capitalize(text))
  })
}

module.exports = { capitalize, capitalizeArray, capitalizeKeys, asyncCapitalize }
