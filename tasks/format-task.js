'use strict'

const run = require('./run-command')

module.exports = (files) => {
  return run('prettier-eslint', ['--write', ...files])
}
