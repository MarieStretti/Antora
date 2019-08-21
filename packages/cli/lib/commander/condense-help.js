'use strict'

const { Command } = require('commander')

const helpInformation = Command.prototype.helpInformation

const QUOTED_DEFAULT_VALUE_RX = / \(default: "([^"]+)"\)/

// TODO include common options when outputting help for a (sub)command
Command.prototype.helpInformation = function () {
  return helpInformation
    .call(this)
    .split(/^/m)
    .reduce((accum, line) => {
      ~line.indexOf('"') ? accum.push(line.replace(QUOTED_DEFAULT_VALUE_RX, ' (default: $1)')) : accum.push(line)
      return accum
    }, [])
    .join('')
}
