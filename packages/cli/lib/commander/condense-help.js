'use strict'

const { Command } = require('commander')

const helpInformation = Command.prototype.helpInformation
const stringify = JSON.stringify

// TODO include common options when outputting help for a (sub)command
Command.prototype.helpInformation = function () {
  // NOTE override stringify to coerce to string normally
  JSON.stringify = (val) => `${val}`
  const helpInfo = helpInformation.call(this)
  JSON.stringify = stringify
  return helpInfo
}
