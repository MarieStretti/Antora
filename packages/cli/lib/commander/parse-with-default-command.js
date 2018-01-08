'use strict'

const { Command } = require('commander')

const parse = Command.prototype.parse

Command.prototype.parse = function (argv, opts = {}) {
  if (argv.length < 3) {
    argv.push('--help')
  } else if (opts.defaultCommand && argv[2] !== '-h' && argv[2] !== '--help') {
    // TODO separate common options from command options (though commander doesn't seem to care)
    // TODO also consider aliases (though we have none at the moment)
    const commandNames = this.commands.map((command) => command.name())
    const commandIdx = argv.slice(2).findIndex((arg) => commandNames.includes(arg))
    if (!~commandIdx) argv.splice(2, 0, opts.defaultCommand)
  }
  return parse.call(this, argv)
}
