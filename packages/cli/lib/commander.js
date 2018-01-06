'use strict'

const commander = require('commander')
require('./commander/condense-help')
require('./commander/options-from-convict')
require('./commander/parse-with-default-command')

module.exports = commander
