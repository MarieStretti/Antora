'use strict'

function preprocessArgv (argv, opts = {}) {
  const cli = opts.cli || require('commander')
  const defaultCommand = opts.defaultCommand
  if (defaultCommand && argv[2] !== '-h' && argv[2] !== '--help') {
    // TODO separate common options from command options
    const commandNames = cli.commands.map((command) => command.name())
    const commandIdx = argv.slice(2).findIndex((arg) => commandNames.includes(arg))
    if (!~commandIdx) argv.splice(2, 0, defaultCommand)
  }
  return argv
}

module.exports = preprocessArgv
