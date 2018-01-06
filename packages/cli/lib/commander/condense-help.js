'use strict'

const { Command } = require('commander')

const helpInformation = Command.prototype.helpInformation
const indentation = '  '

// TODO include common options when outputting help for a (sub)command
Command.prototype.helpInformation = function () {
  return helpInformation.call(this).split(/^/m).reduce((accum, line) => {
    if (line === '\n') {
      const lastLine = accum[accum.length - 1]
      if (lastLine === undefined || !(lastLine === '\n' || lastLine.endsWith(':\n'))) accum.push(line)
    } else if (line.startsWith(indentation + 'Usage: ') && this.parent) {
      let ancestor = this
      let commandCtx = []
      while ((ancestor = ancestor.parent)) commandCtx.unshift(ancestor.name())
      accum.push('Usage: ' + commandCtx.join(' ') + line.substr(8))
    } else {
      accum.push(line.substr(indentation.length))
    }
    return accum
  }, []).join('')
}
