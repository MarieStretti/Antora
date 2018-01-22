#!/usr/bin/env node

'use strict'

const cli = require('./commander')
// Q: can we ask the playbook builder for the config schema?
const configSchema = require('@antora/playbook-builder/lib/config/schema')
const fs = require('fs')
const path = require('path')
const solitaryConvict = require('@antora/playbook-builder/lib/solitary-convict')

const VERSION = require('../package.json').version

async function run () {
  const result = cli.parse(process.argv, { defaultCommand: 'generate' })
  /* istanbul ignore else */
  if (cli._promise) await cli._promise
  return result
}

function requireSiteGenerator (name) {
  const localPath = path.resolve('node_modules', name)
  return require(fs.existsSync(path.join(localPath, 'package.json')) ? localPath : name)
}

cli
  .name('antora')
  .version(VERSION, '-v, --version')
  .description('A modular, multi-repository documentation site generator for AsciiDoc.')
  .usage('[options] [[command] [args]]')
  .option('--stacktrace', 'Print the stacktrace to the console if the application fails.')

cli
  .command('generate <playbook>')
  .description('Generate a documentation site specified in <playbook>.')
  .optionsFromConvict(solitaryConvict(configSchema), { exclude: 'playbook' })
  // FIXME promote these to be playbook options
  .option('--clean', 'Remove output directory before generating site.')
  .option('--to-dir <dir>', 'The directory where the site should be generated.', 'build/site')
  .action(async (playbookFile, command) => {
    let generateSite
    try {
      // TODO honor generator option (or auto-detect)
      generateSite = requireSiteGenerator('@antora/site-generator-default')
    } catch (e) {
      console.error('error: No site generator installed. Try installing @antora/site-generator-default.')
      process.exit(1)
    }
    const args = cli.rawArgs.slice(cli.rawArgs.indexOf(command.name()) + 1)
    args.splice(args.indexOf(playbookFile), 0, '--playbook')
    // TODO support passing a preconfigured convict config as third option; gets new args and env
    if (command.clean) require('fs-extra').emptyDirSync(command.toDir)
    cli._promise = generateSite(args, process.env, command.toDir).catch((reason) => {
      console.error(cli.stacktrace ? reason.stack : 'error: ' + reason.message)
      process.exit(1)
    })
  })
  .options.sort((a, b) => a.long.localeCompare(b.long))

cli.command('help [command]', { noHelp: true }).action((name, command) => {
  if (name) {
    const helpCommand = cli.commands.find((candidate) => candidate.name() === name)
    if (helpCommand) {
      helpCommand.help()
    } else {
      console.error(
        `'${name}' is not a valid command in ${cli.name()}. See '${cli.name()} --help' for a list of commands.`
      )
      process.exit(1)
    }
  } else {
    cli.help()
  }
})

cli.command('version', { noHelp: true }).action(() => cli.emit('option:version'))

cli.on('--help', () => {
  console.log(
    `\nRun '${cli.name()} <command> --help' to see options and examples for a command (e.g., ${cli.name()} generate --help).`
  )
})

module.exports = run
