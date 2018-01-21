/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const fs = require('fs-extra')
const { default: Kapok } = require('kapok-js')
const pkg = require('@antora/cli/package.json')
const path = require('path')
const RepositoryBuilder = require('../../../test/repository-builder')

const ANTORA_CLI = require.resolve(path.join('@antora/cli', pkg.bin.antora))
const CONTENT_REPOS_DIR = path.resolve(__dirname, 'content-repos')
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const TIMEOUT = 30000
const UI_BUNDLE_URI =
  'https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/master/raw/build/ui-bundle.zip?job=bundle-stable'
const VERSION = pkg.version
const WORK_DIR = path.resolve(__dirname, 'work')

Kapok.config.shouldShowLog = false

describe('cli', () => {
  let playbookSpec
  let playbookSpecFile
  let destAbsDir
  let destDir
  let uiBundleUri

  const createContentRepository = async () =>
    new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR)
      .init('the-component')
      .then((repoBuilder) => repoBuilder.checkoutBranch('v1.0'))
      .then((repoBuilder) =>
        repoBuilder.addComponentDescriptorToWorktree({
          name: 'the-component',
          version: '1.0',
          nav: ['modules/ROOT/nav.adoc'],
        })
      )
      .then((repoBuilder) => repoBuilder.importFilesFromFixture('the-component'))
      .then((repoBuilder) => repoBuilder.close('master'))

  // FIXME the antora generate command should work without changing cwd
  const runAntora = (args = undefined, env = process.env) => {
    if (!Array.isArray(args)) args = args ? args.split(' ') : []
    return Kapok.start(ANTORA_CLI, args, { cwd: WORK_DIR, env })
  }

  before(async () => {
    fs.removeSync(CONTENT_REPOS_DIR)
    await createContentRepository()
    destDir = 'build/site'
    destAbsDir = path.join(WORK_DIR, destDir)
    playbookSpecFile = path.join(WORK_DIR, 'the-site.json')
    uiBundleUri = UI_BUNDLE_URI
  })

  beforeEach(() => {
    fs.ensureDirSync(WORK_DIR)
    fs.removeSync(playbookSpecFile)
    fs.removeSync(path.join(WORK_DIR, destDir.split('/')[0]))
    playbookSpec = {
      site: { title: 'The Site' },
      content: {
        sources: [{ url: path.join(CONTENT_REPOS_DIR, 'the-component'), branches: 'v1.0' }],
      },
      ui: { bundle: uiBundleUri },
    }
  })

  after(() => {
    fs.removeSync(CONTENT_REPOS_DIR)
    if (process.env.KEEP_CACHE) {
      fs.removeSync(path.join(WORK_DIR, destDir.split('/')[0]))
      fs.removeSync(playbookSpecFile)
    } else {
      fs.removeSync(WORK_DIR)
    }
  })

  it('should output version when called with "-v"', () => {
    return runAntora('-v')
      .assert(VERSION)
      .done()
  })

  it('should output version when invoked with "version"', () => {
    return runAntora('version')
      .assert(VERSION)
      .done()
  })

  it('should output usage when called with no command, options, or arguments', () => {
    return runAntora()
      .assert(/^Usage: antora/)
      .done()
  })

  it('should output usage when called with "-h"', () => {
    return runAntora('-h')
      .assert(/^Usage: antora/)
      .done()
  })

  it('should output list of common options when invoked with "-h"', () => {
    return runAntora('-h')
      .ignoreUntil(/^Options:/)
      .assert(/^ *-v, --version/)
      .done()
  })

  it('should output list of commands when invoked with "-h"', () => {
    return runAntora('-h')
      .ignoreUntil(/^Commands:/)
      .assert(/^ *generate \[options\] <playbook>/)
      .done()
  })

  it('should output usage for generate command when invoked with "generate -h"', () => {
    return runAntora('generate -h')
      .assert(/^Usage: antora generate/)
      .done()
  })

  it('should output usage for generate command when invoked with "help generate"', () => {
    return runAntora('help generate')
      .assert(/^Usage: antora generate/)
      .done()
  })

  it('should output usage for main command when invoked with "help"', () => {
    return runAntora('help')
      .assert(/^Usage: antora/)
      .done()
  })

  it('should output warning that command does not exist when invoked with "help no-such-command"', () => {
    return runAntora('help no-such-command')
      .assert(/not a valid command/)
      .done()
  })

  it('should output options from playbook schema for generate command', () => {
    let options
    return (
      runAntora('generate -h')
        .ignoreUntil(/^Options:/)
        // -h option is always listed last
        .joinUntil(/^ *-h, --help/, { join: '\n' })
        .assert((optionsText) => {
          options = optionsText.split('\n').reduce((accum, line) => {
            const [sig, ...dsc] = line.split('  ')
            accum[sig.trim()] = dsc.join('').trim()
            return accum
          }, {})
          return true
        })
        .done()
        .then(() => {
          const optionForms = Object.keys(options)
          expect(optionForms).to.not.be.empty()
          expect(optionForms).to.include('--title <title>')
          expect(optionForms).to.include('--url <url>')
          expect(optionForms).to.include('--html-url-extension-style <default|drop|indexify>')
          expect(options['--html-url-extension-style <default|drop|indexify>']).to.have.string('(default: default)')
          // check for sorted option, except drop -h as it always comes last
          expect(optionForms.slice(0, -1)).to.eql(
            Object.keys(options)
              .slice(0, -1)
              .sort((a, b) => a.localeCompare(b))
          )
        })
    )
  })

  it('should show error message if generate command is run without an argument', () => {
    return runAntora('generate')
      .assert(/missing required argument `playbook'/)
      .done()
  })

  it('should show error message if specified playbook file does not exist', () => {
    return runAntora('generate does-not-exist.json')
      .assert(/playbook .* does not exist/)
      .done()
  }).timeout(TIMEOUT)

  it('should show stack if --stacktrace option is specified and exception is thrown during generation', () => {
    playbookSpec.ui.bundle = false
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    return runAntora('--stacktrace generate the-site')
      .assert(/^Error: ui\.bundle: must be of type String/)
      .assert(/at /)
      .done()
  }).timeout(TIMEOUT)

  it('should generate site to fs destination when playbook is passed to the generate command', () => {
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => {
      runAntora('generate the-site').on('exit', () => resolve())
    }).then(() => {
      expect(destAbsDir)
        .to.be.a.directory()
        .with.subDirs(['_', 'the-component'])
      expect(path.join(destAbsDir, 'the-component'))
        .to.be.a.directory()
        .with.subDirs(['1.0'])
      expect(path.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
    })
  }).timeout(TIMEOUT)

  it('should allow CLI option to override properties set in playbook file', () => {
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => {
      runAntora(['generate', 'the-site', '--title', 'Awesome Docs']).on('exit', () => resolve())
    }).then(() => {
      expect(path.join(destAbsDir, 'the-component/1.0/index.html'))
        .to.be.a.file()
        .with.contents.that.match(new RegExp('<title>Index Page :: Awesome Docs</title>'))
    })
  }).timeout(TIMEOUT)

  it('should allow environment variable to override properties set in playbook file', () => {
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => {
      runAntora('generate the-site', Object.assign({ URL: 'https://docs.example.com' }, process.env)).on('exit', () =>
        resolve()
      )
    }).then(() => {
      expect(path.join(destAbsDir, 'the-component/1.0/index.html'))
        .to.be.a.file()
        .with.contents.that.match(new RegExp('<link rel="canonical" href="https://docs.example.com/[^"]*">'))
    })
  }).timeout(TIMEOUT)

  it('should invoke generate command if no command is specified', () => {
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => {
      // TODO once we have common options, we'll need to be sure they get moved before the default command
      runAntora('the-site.json --url https://docs.example.com').on('exit', () => resolve())
    }).then(() => {
      expect(path.join(destAbsDir, 'the-component/1.0/index.html'))
        .to.be.a.file()
        .with.contents.that.match(new RegExp('<link rel="canonical" href="https://docs.example.com/[^"]*">'))
    })
  }).timeout(TIMEOUT)

  it('should clean output directory before generating when --clean switch is used', () => {
    const residualFile = path.join(destAbsDir, 'the-component/1.0/old-page.html')
    fs.ensureDirSync(path.dirname(residualFile))
    fs.writeFileSync(residualFile, '<!DOCTYPE html><html><body>contents</body></html>')
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => {
      runAntora('generate the-site.json --clean').on('exit', () => resolve())
    }).then(() => {
      expect(path.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
      expect(residualFile).not.to.be.a.path()
    })
  }).timeout(TIMEOUT)

  it('should output to directory specified by --to-dir option', () => {
    // NOTE we must use a subdirectory of destDir so it gets cleaned up properly
    const betaDestDir = path.join(destDir, 'beta')
    const betaDestAbsDir = path.join(destAbsDir, 'beta')
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => {
      runAntora('generate the-site.json --to-dir ' + betaDestDir).on('exit', () => resolve())
    }).then(() => {
      expect(betaDestAbsDir).to.be.a.directory()
      expect(path.join(betaDestAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
    })
  }).timeout(TIMEOUT)

  it('should discover locally installed default site generator', () => {
    const globalModulePath = require.resolve('@antora/site-generator-default')
    const localNodeModules = path.join(WORK_DIR, 'node_modules')
    const localModulePath = path.join(localNodeModules, '@antora/site-generator-default')
    fs.ensureDirSync(localModulePath)
    fs.writeFileSync(path.join(localModulePath, 'index.js'), `module.exports = require('${globalModulePath}')`)
    fs.writeJsonSync(path.join(localModulePath, 'package.json'), { main: 'index.js' }, { spaces: 2 })
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    return new Promise((resolve) => {
      runAntora('generate the-site').on('exit', (code) => {
        fs.removeSync(localNodeModules)
        resolve(code)
      })
    }).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(destAbsDir).to.be.a.directory()
      expect(path.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
    })
  }).timeout(TIMEOUT)

  it('should show error message if site generator fails to load', () => {
    const localNodeModules = path.join(WORK_DIR, 'node_modules')
    const localModulePath = path.join(localNodeModules, '@antora/site-generator-default')
    fs.ensureDirSync(localModulePath)
    fs.writeFileSync(path.join(localModulePath, 'index.js'), 'throw false')
    fs.writeJsonSync(path.join(localModulePath, 'package.json'), { main: 'index.js' }, { spaces: 2 })
    fs.writeJsonSync(playbookSpecFile, playbookSpec, { spaces: 2 })
    return runAntora('generate the-site')
      .assert(/no site generator/i)
      .on('exit', () => fs.removeSync(localNodeModules))
      .done()
  })
})
