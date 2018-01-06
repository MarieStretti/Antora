'use strict'

const { Command } = require('commander')

const parse = Command.prototype.parse

Command.prototype.parse = function (argv, opts = {}) {
  const defaultCommand = opts.defaultCommand
  if (defaultCommand && argv[2] !== '-h' && argv[2] !== '--help') {
    // TODO separate common options from command options; include aliases
    const commandNames = this.commands.map((command) => command.name())
    const commandIdx = argv.slice(2).findIndex((arg) => commandNames.includes(arg))
    if (!~commandIdx) argv.splice(2, 0, defaultCommand)
  }
  return parse.call(this, argv)
}
