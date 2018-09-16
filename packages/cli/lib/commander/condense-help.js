'use strict'

const { Command } = require('commander')

const helpInformation = Command.prototype.helpInformation

// TODO include common options when outputting help for a (sub)command
Command.prototype.helpInformation = function () {
  return helpInformation
    .call(this)
    .split(/^/m)
    .reduce((accum, line) => {
      if (line === '\n') {
        const prevLine = accum[accum.length - 1]
        if (prevLine === undefined || !(prevLine === '\n' || prevLine.endsWith(':\n'))) accum.push(line)
      } else if (line.startsWith('Usage: ')) {
        if (this.parent) {
          let ancestor = this
          let commandCtx = []
          while ((ancestor = ancestor.parent)) commandCtx.unshift(ancestor.name())
          accum.push('Usage: ' + commandCtx.join(' ') + line.substr(6))
        } else {
          accum.push(line)
        }
      } else if (line.startsWith('  -v,') || line.startsWith('  -h,')) {
        accum.push(line.trimRight().replace('  output', '  Output') + '.\n')
      } else {
        accum.push(line)
      }
      return accum
    }, [])
    .join('')
}
