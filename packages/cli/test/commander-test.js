/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const { Command } = require('commander')
require('@antora/cli/lib/commander/options-from-convict')
require('@antora/cli/lib/commander/parse-with-default-command')
const convict = require('convict')

describe('commander', () => {
  describe('parse()', () => {
    class ProcessExit extends Error {
      constructor (code) {
        super('process exit')
        this.code = code
      }
    }

    const trapExit = (block) => {
      const $exit = process.exit
      process.exit = (code) => {
        throw new ProcessExit(code)
      }
      try {
        block()
      } finally {
        process.exit = $exit
      }
    }

    const createCli = (name) =>
      new Command()
        .name(name)
        .option('--silent', 'Silence is golden')
        .command('sync')
        .action(() => {})
        .parent.command('run')
        .option('--title <title>', 'Site title')
        .option('--url <url>', 'Site URL')
        .action(() => {}).parent

    it('should output help if no command, options, or arguments are specified', () => {
      trapExit(() => {
        let helpShown
        const command = createCli('cli')
        command.outputHelp = () => (helpShown = true)
        expect(() => command.parse(['node', 'cli']))
          .to.throw(ProcessExit)
          .with.property('code', 0)
        expect(command.rawArgs.slice(2)).to.eql(['--help'])
        expect(helpShown).to.be.true()
      })
    })

    it('should not insert default command if no default command is provided', () => {
      const command = createCli('cli').parse(['node', 'cli', '--silent'])
      expect(command.rawArgs.slice(2)).to.eql(['--silent'])
      expect(command).to.have.property('silent', true)
    })

    it('should insert default command if no command is present', () => {
      const command = createCli('cli').parse(['node', 'cli', '--silent'], { defaultCommand: 'run' })
      expect(command.rawArgs.slice(2)).to.eql(['run', '--silent'])
      expect(command).to.have.property('silent', true)
    })

    it('should not insert default command if already present', () => {
      const command = createCli('cli').parse(['node', 'cli', 'run'], { defaultCommand: 'run' })
      expect(command.rawArgs.slice(2)).to.eql(['run'])
    })

    it('should not insert default command if -h is specified', () => {
      trapExit(() => {
        let helpShown
        const command = createCli('cli')
        command.outputHelp = () => (helpShown = true)
        expect(() => command.parse(['node', 'cli', '-h']))
          .to.throw(ProcessExit)
          .with.property('code', 0)
        expect(command.rawArgs.slice(2)).to.eql(['-h'])
        expect(helpShown).to.be.true()
      })
    })

    it('should not insert default command if --help is specified', () => {
      trapExit(() => {
        let helpShown
        const command = createCli('cli')
        command.outputHelp = () => (helpShown = true)
        expect(() => command.parse(['node', 'cli', '--help']))
          .to.throw(ProcessExit)
          .with.property('code', 0)
        expect(command.rawArgs.slice(2)).to.eql(['--help'])
        expect(helpShown).to.be.true()
      })
    })

    it('should insert default command before other arguments and options', () => {
      const command = createCli('cli').parse(['node', 'cli', '--title', 'Docs', '--url', 'https://docs.example.com'], {
        defaultCommand: 'run',
      })
      expect(command.rawArgs.slice(2)).to.eql(['run', '--title', 'Docs', '--url', 'https://docs.example.com'])
      const runCommand = command.commands.find((candidate) => candidate.name() === 'run')
      expect(runCommand).to.exist()
      expect(runCommand).to.have.property('title', 'Docs')
      expect(runCommand).to.have.property('url', 'https://docs.example.com')
    })
  })

  describe('optionsFromConvict()', () => {
    let $argv
    let $env

    const createCli = (schema, opts = undefined) => new Command('cli').optionsFromConvict(convict(schema), opts)

    before(() => {
      $argv = process.argv
      $env = process.env
      process.argv = ['node', 'cli']
      process.env = {}
    })

    after(() => {
      process.argv = $argv
      process.env = $env
    })

    it('should import option with required argument from convict config', () => {
      const configSchema = {
        host: {
          arg: 'host',
          default: 'localhost',
          doc: 'Server hostname',
          format: String,
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
    })

    it('should not mark option imported from convict config as required if default is undefined', () => {
      const configSchema = {
        host: {
          arg: 'host',
          default: undefined,
          doc: 'Server hostname',
          format: String,
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
      })
    })

    it('should mark option imported from convict config as required if default is null', () => {
      const configSchema = {
        host: {
          arg: 'host',
          default: null,
          doc: 'Server hostname',
          format: String,
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname (required)',
      })
    })

    it('should import boolean option from convict config', () => {
      const configSchema = {
        quiet: {
          arg: 'quiet',
          default: false,
          doc: 'Be quiet',
          format: Boolean,
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--quiet',
        flags: '--quiet',
        description: 'Be quiet',
      })
      expect(options[0]).not.to.have.property('defaultValue')
    })

    it('should import negatable boolean option from convict config', () => {
      const configSchema = {
        cache: {
          arg: 'no-cache',
          default: true,
          doc: 'Do not use cache',
          format: Boolean,
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--no-cache',
        flags: '--no-cache',
        description: 'Do not use cache',
        defaultValue: true,
      })
    })

    it('should derive argument placeholder from option name', () => {
      const configSchema = {
        urlStrategy: {
          arg: 'url-strategy',
          default: 'default',
          doc: 'URL strategy',
          format: String,
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--url-strategy',
        flags: '--url-strategy <strategy>',
        description: 'URL strategy',
        defaultValue: 'default',
      })
    })

    it('should derive argument placeholder from enumeration options', () => {
      const configSchema = {
        urlStrategy: {
          arg: 'url-strategy',
          default: 'default',
          doc: 'URL strategy',
          format: ['default', 'drop', 'indexify'],
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--url-strategy',
        flags: '--url-strategy <default|drop|indexify>',
        description: 'URL strategy',
        defaultValue: 'default',
      })
    })

    it('should import multiple options from convict config', () => {
      const configSchema = {
        host: {
          arg: 'host',
          default: 'localhost',
          doc: 'Server hostname',
          format: String,
        },
        port: {
          arg: 'port',
          default: '9191',
          doc: 'Server port',
          format: 'port',
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(2)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
      expect(options[1]).to.include({
        long: '--port',
        flags: '--port <port>',
        description: 'Server port',
        defaultValue: '9191',
      })
    })

    it('should import nested options from convict config', () => {
      const configSchema = {
        site: {
          title: {
            arg: 'title',
            default: 'The Title',
            doc: 'Site title',
            format: String,
          },
        },
        server: {
          host: {
            arg: 'host',
            default: 'localhost',
            doc: 'Server hostname',
            format: String,
          },
          port: {
            arg: 'port',
            default: '9191',
            doc: 'Server port',
            format: 'port',
          },
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(3)
      expect(options[0]).to.include({
        long: '--title',
        flags: '--title <title>',
        description: 'Site title',
        defaultValue: 'The Title',
      })
      expect(options[1]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
      expect(options[2]).to.include({
        long: '--port',
        flags: '--port <port>',
        description: 'Server port',
        defaultValue: '9191',
      })
    })

    it('should skip option from convict config if marked as excluded', () => {
      const configSchema = {
        site: {
          title: {
            arg: 'title',
            default: 'The Title',
            doc: 'Site title',
            format: String,
          },
        },
        server: {
          host: {
            arg: 'host',
            default: 'localhost',
            doc: 'Server hostname',
            format: String,
          },
          port: {
            arg: 'port',
            default: '9191',
            doc: 'Server port',
            format: 'port',
          },
        },
      }
      const options = createCli(configSchema, { exclude: 'title' }).options
      expect(options).to.have.lengthOf(2)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
      expect(options[1]).to.include({
        long: '--port',
        flags: '--port <port>',
        description: 'Server port',
        defaultValue: '9191',
      })
    })

    it('should skip options from convict config if marked as excluded', () => {
      const configSchema = {
        site: {
          title: {
            arg: 'title',
            default: 'The Title',
            doc: 'Site title',
            format: String,
          },
        },
        server: {
          host: {
            arg: 'host',
            default: 'localhost',
            doc: 'Server hostname',
            format: String,
          },
          port: {
            arg: 'port',
            default: '9191',
            doc: 'Server port',
            format: 'port',
          },
        },
      }
      const options = createCli(configSchema, { exclude: ['title', 'port'] }).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
    })

    it('should skip options in convict config without an arg', () => {
      const configSchema = {
        site: {
          title: {
            default: 'The Title',
            doc: 'Site title',
            format: String,
          },
        },
        server: {
          host: {
            arg: 'host',
            default: 'localhost',
            doc: 'Server hostname',
            format: String,
          },
          port: {
            default: '9191',
            doc: 'Server port',
            format: 'port',
          },
        },
      }
      const options = createCli(configSchema).options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
    })

    it('should add option from convict config to command', () => {
      const configSchema = {
        host: {
          arg: 'host',
          default: 'localhost',
          doc: 'Server hostname',
          format: String,
        },
      }
      const cli = createCli({})
      cli.command('generate').optionsFromConvict(convict(configSchema))
      const options = cli.commands.find((candidate) => candidate.name() === 'generate').options
      expect(options).to.have.lengthOf(1)
      expect(options[0]).to.include({
        long: '--host',
        flags: '--host <host>',
        description: 'Server hostname',
        defaultValue: 'localhost',
      })
    })
  })
})
