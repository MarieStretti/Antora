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
      if (line.startsWith('Usage: ')) {
        if (this.parent) {
          const commandCtx = []
          let ancestor = this
          while ((ancestor = ancestor.parent)) commandCtx.unshift(ancestor.name())
          accum.push('Usage: ' + commandCtx.join(' ') + line.substr(6))
        } else {
          accum.push(line)
        }
      } else if (line.startsWith('  -v,') || line.startsWith('  -h,')) {
        accum.push(line.trimRight().replace('  output', '  Output') + '.\n')
      } else if (~line.indexOf('"')) {
        accum.push(line.replace(QUOTED_DEFAULT_VALUE_RX, ' (default: $1)'))
      } else {
        accum.push(line)
      }
      return accum
    }, [])
    .join('')
}
