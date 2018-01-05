#!/usr/bin/env node

const cli = require('commander')
require('./commander/condense-help')
require('./commander/options-from-convict')
// Q: can we ask the playbook builder for the config schema?
const configSchema = require('@antora/playbook-builder/lib/config/schema')
const preprocessArgv = require('./preprocess-argv')
const solitaryConvict = require('@antora/playbook-builder/lib/solitary-convict')

let actionPromise

async function run () {
  const result = cli.parse(preprocessArgv(process.argv, { defaultCommand: 'generate' }))
  if (actionPromise) await actionPromise
  return result
}

cli
  .name('antora')
  .version(require('../package.json').version, '-v, --version')
  .description('A modular, multi-repository documentation site generator for AsciiDoc.')
  .usage('[options] [[command] [args]]')

cli
  .command('generate <playbook>')
  .description('Generate a documentation site specified in <playbook>.')
  .optionsFromConvict(solitaryConvict(configSchema, { args: [], env: {} }), { exclude: 'playbook' })
  // FIXME these need to be playbook options
  .option('--clean', 'Remove output directory before generating site.')
  .option('--to-dir <dir>', 'The directory where the site should be generated.', 'build/site')
  .action(async (playbookFile, command) => {
    const args = cli.rawArgs.slice(cli.rawArgs.indexOf(command.name()) + 1)
    args.splice(args.indexOf(playbookFile), 0, '--playbook')
    // TODO detect custom generator
    // TODO support passing a preconfigured convict config as third option; gets new args and env
    if (command.clean) require('fs-extra').emptyDirSync(command.toDir)
    actionPromise = require('@antora/pipeline-default')(args, process.env, command.toDir)
  })
  .options.sort((a, b) => a.long.localeCompare(b.long))

cli
  .command('help [command]', { noHelp: true })
  .action((name, command) => {
    if (name) {
      const helpCommand = cli.commands.find((candidate) =>
        candidate.name() === name || candidate.alias() === name
      )
      if (helpCommand) {
        // TODO show common options; perhaps hack commander-condense-help
        process.stdout.write(helpCommand.helpInformation())
      } else {
        console.error(`'${name}' is not a valid command in ${cli.name()}. See '${cli.name()} --help' for a list of commands.`)
      }
    } else {
      cli.outputHelp()
    }
  })

cli
  .on('--help', () => {
    console.log(`\nRun '${cli.name()} <command> --help' to see options and examples for a command (e.g., ${cli.name()} generate --help).`)
  })
  //.commands.sort((a, b) => a.name().localeCompare(b.name()))

module.exports = run
