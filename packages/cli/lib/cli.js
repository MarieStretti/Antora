#!/usr/bin/env node

'use strict'

const cli = require('./commander')
// Q: can we ask the playbook builder for the config schema?
const configSchema = require('@antora/playbook-builder/lib/config/schema')
const convict = require('@antora/playbook-builder/lib/solitary-convict')
const ospath = require('path')

const DOT_RELATIVE_RX = new RegExp(`^\\.{1,2}[/${ospath.sep.replace('/', '').replace('\\', '\\\\')}]`)
const { version: VERSION } = require('../package.json')

async function run () {
  const result = cli.parse(process.argv, { defaultCommand: 'generate' })
  /* istanbul ignore else */
  if (cli._promise) await cli._promise
  return result
}

//process.on('unhandledRejection', (reason) => {
//  console.error(`An unexpected error occurred: Unhandled promise rejection: ${reason.stack}`)
//  process.exitCode = 1
//})

function exitWithError (err, showStack, msg = undefined) {
  msg = showStack ? err.stack : `error: ${msg || err.message}\nAdd the --stacktrace option to see the cause.`
  console.error(msg)
  process.exit(1)
}

function requireLibraries (requirePaths) {
  if (requirePaths) requirePaths.forEach((requirePath) => requireLibrary(requirePath))
}

function requireLibrary (requirePath, cwd = process.cwd()) {
  if (requirePath.charAt() === '.' && DOT_RELATIVE_RX.test(requirePath)) {
    // NOTE require resolves a dot-relative path relative to current file; resolve relative to cwd instead
    requirePath = ospath.resolve(requirePath)
  } else if (!ospath.isAbsolute(requirePath)) {
    // NOTE appending node_modules prevents require from looking elsewhere before looking in these paths
    const paths = [cwd, ospath.dirname(__dirname)].map((start) => ospath.join(start, 'node_modules'))
    requirePath = require.resolve(requirePath, { paths })
  }
  return require(requirePath)
}

cli
  .name('antora')
  .version(VERSION, '-v, --version')
  .description('A modular, multi-repository documentation site generator for AsciiDoc.')
  .usage('[options] [[command] [args]]')
  .option('-r, --require <library>', 'Require library (aka node module) or script before executing command.')
  .on('option:require', (requirePath) => (cli.requirePaths = (cli.requirePaths || []).concat(requirePath)))
  .option('--stacktrace', 'Print the stacktrace to the console if the application fails.')

cli
  .command('generate <playbook>')
  .description('Generate a documentation site specified in <playbook>.')
  .optionsFromConvict(convict(configSchema), { exclude: 'playbook' })
  .action(async (playbookFile, command) => {
    try {
      requireLibraries(cli.requirePaths)
    } catch (err) {
      exitWithError(err, cli.stacktrace)
    }
    let generateSite
    try {
      // TODO honor --generator option (or auto-detect)
      generateSite = requireLibrary('@antora/site-generator-default', ospath.resolve(playbookFile, '..'))
    } catch (err) {
      const msg = 'Generator not found or failed to load. Try installing the @antora/site-generator-default package.'
      exitWithError(err, cli.stacktrace, msg)
    }
    const args = cli.rawArgs.slice(cli.rawArgs.indexOf(command.name()) + 1)
    args.splice(args.indexOf(playbookFile), 0, '--playbook')
    // TODO support passing a preloaded convict config as third option; gets new args and env
    cli._promise = generateSite(args, process.env).catch((err) => exitWithError(err, cli.stacktrace))
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
