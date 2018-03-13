/* eslint-env mocha */
'use strict'

const { expect, heredoc, removeSyncForce } = require('../../../test/test-utils')

const fs = require('fs-extra')
const { default: Kapok } = require('kapok-js')
const pkg = require('@antora/cli/package.json')
const os = require('os')
const ospath = require('path')
const RepositoryBuilder = require('../../../test/repository-builder')

const ANTORA_CLI = ospath.resolve('node_modules', '.bin', os.platform() === 'win32' ? 'antora.cmd' : 'antora')
const CONTENT_REPOS_DIR = ospath.join(__dirname, 'content-repos')
const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')
const TIMEOUT = 30000
const UI_BUNDLE_URI =
  'https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/master/raw/build/ui-bundle.zip?job=bundle-stable'
const VERSION = pkg.version
const WORK_DIR = ospath.join(__dirname, 'work')

Kapok.config.shouldShowLog = false

describe('cli', () => {
  let destAbsDir
  let destDir
  let playbookSpec
  let playbookFile
  let repositoryBuilder
  let uiBundleUri

  const createContentRepository = async () =>
    (repositoryBuilder = new RepositoryBuilder(CONTENT_REPOS_DIR, FIXTURES_DIR, { remote: true, bare: true }))
      .init('the-component')
      .then((builder) => builder.checkoutBranch('v1.0'))
      .then((builder) =>
        builder.addComponentDescriptorToWorktree({
          name: 'the-component',
          version: '1.0',
          nav: ['modules/ROOT/nav.adoc'],
        })
      )
      .then((builder) => builder.importFilesFromFixture('the-component'))
      .then((builder) => builder.close('master'))

  // NOTE run the antora command from WORK_DIR by default to simulate a typical use case
  const runAntora = (args = undefined, env = undefined, cwd = WORK_DIR) => {
    if (!Array.isArray(args)) args = args ? args.split(' ') : []
    env = Object.assign({}, process.env, { ANTORA_CACHE_DIR: ospath.join(WORK_DIR, '.antora/cache') }, env)
    return Kapok.start(ANTORA_CLI, args, { cwd, env })
  }

  before(async () => {
    removeSyncForce(CONTENT_REPOS_DIR)
    await createContentRepository()
    destDir = 'build/site'
    destAbsDir = ospath.join(WORK_DIR, destDir)
    playbookFile = ospath.join(WORK_DIR, 'the-site.json')
    uiBundleUri = UI_BUNDLE_URI
  })

  beforeEach(() => {
    fs.ensureDirSync(WORK_DIR)
    fs.removeSync(playbookFile)
    // NOTE keep the default cache folder between tests
    removeSyncForce(ospath.join(WORK_DIR, destDir.split('/')[0]))
    removeSyncForce(ospath.join(WORK_DIR, '.antora-cache-override'))
    playbookSpec = {
      site: { title: 'The Site' },
      content: {
        sources: [{ url: repositoryBuilder.repoPath, branches: 'v1.0' }],
      },
      ui: { bundle: { url: uiBundleUri, snapshot: true } },
    }
  })

  after(() => {
    removeSyncForce(CONTENT_REPOS_DIR)
    if (process.env.KEEP_CACHE) {
      removeSyncForce(ospath.join(WORK_DIR, destDir.split('/')[0]))
      fs.removeSync(playbookFile)
    } else {
      removeSyncForce(WORK_DIR)
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
      .assert(/^ *-v, --version /)
      .assert(/^ *-r, --require /)
      .assert(/^ *--stacktrace /)
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
    playbookSpec.ui.bundle.url = false
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    return runAntora('--stacktrace generate the-site')
      .assert(/^Error: ui\.bundle\.url: must be of type String/)
      .assert(/at /)
      .done()
  }).timeout(TIMEOUT)

  it('should generate site to fs destination when playbook file is passed to generate command', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => runAntora('generate the-site --quiet').on('exit', resolve)).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(destAbsDir)
        .to.be.a.directory()
        .with.subDirs(['_', 'the-component'])
      expect(ospath.join(destAbsDir, 'the-component'))
        .to.be.a.directory()
        .with.subDirs(['1.0'])
      expect(ospath.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
    })
  }).timeout(TIMEOUT)

  it('should generate site to fs destination when absolute playbook file is passed to generate command', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => runAntora(['generate', playbookFile, '--quiet']).on('exit', resolve)).then(
      (exitCode) => {
        expect(exitCode).to.equal(0)
        expect(destAbsDir)
          .to.be.a.directory()
          .with.subDirs(['_', 'the-component'])
        expect(ospath.join(destAbsDir, 'the-component'))
          .to.be.a.directory()
          .with.subDirs(['1.0'])
        expect(ospath.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
      }
    )
  }).timeout(TIMEOUT)

  it('should resolve dot-relative paths in playbook relative to playbook dir', () => {
    const runCwd = ospath.join(WORK_DIR, 'some-other-folder')
    fs.ensureDirSync(runCwd)
    const playbookRelFile = ospath.relative(runCwd, playbookFile)
    playbookSpec.content.sources[0].url =
      '.' + ospath.sep + ospath.relative(WORK_DIR, playbookSpec.content.sources[0].url)
    playbookSpec.ui.bundle.url =
      '.' + ospath.sep + ospath.relative(WORK_DIR, ospath.join(FIXTURES_DIR, 'ui-bundle.zip'))
    playbookSpec.output = { dir: '.' + ospath.sep + destDir }
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) =>
      runAntora(['generate', playbookRelFile, '--quiet'], undefined, runCwd).on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(destAbsDir)
        .to.be.a.directory()
        .with.subDirs(['_', 'the-component'])
      expect(ospath.join(destAbsDir, 'the-component'))
        .to.be.a.directory()
        .with.subDirs(['1.0'])
      expect(ospath.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
    })
  }).timeout(TIMEOUT)

  it('should store cache in cache directory passed to --cache-dir option', () => {
    playbookSpec.content.sources[0].url = repositoryBuilder.url
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const cacheAbsDir = ospath.resolve(WORK_DIR, '.antora-cache-override')
    expect(cacheAbsDir).to.not.be.a.path()
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) =>
      runAntora(['generate', 'the-site', '--cache-dir', '.antora-cache-override']).on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(cacheAbsDir)
        .to.be.a.directory()
        .with.subDirs(['content', 'ui'])
      expect(ospath.join(cacheAbsDir, 'content'))
        .to.be.a.directory()
        .and.not.be.empty()
      expect(ospath.join(cacheAbsDir, 'ui'))
        .to.be.a.directory()
        .and.not.be.empty()
      removeSyncForce(cacheAbsDir)
    })
  }).timeout(TIMEOUT)

  it('should store cache in cache directory defined by ANTORA_CACHE_DIR environment variable', () => {
    playbookSpec.content.sources[0].url = repositoryBuilder.url
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const cacheAbsDir = ospath.resolve(WORK_DIR, '.antora-cache-override')
    expect(cacheAbsDir).to.not.be.a.path()
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) =>
      runAntora('generate the-site', { ANTORA_CACHE_DIR: '.antora-cache-override' }).on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(cacheAbsDir)
        .to.be.a.directory()
        .with.subDirs(['content', 'ui'])
      expect(ospath.join(cacheAbsDir, 'content'))
        .to.be.a.directory()
        .and.not.be.empty()
      expect(ospath.join(cacheAbsDir, 'ui'))
        .to.be.a.directory()
        .and.not.be.empty()
      removeSyncForce(cacheAbsDir)
    })
  }).timeout(TIMEOUT)

  it('should allow CLI option to override properties set in playbook file', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) =>
      runAntora(['generate', 'the-site', '--title', 'Awesome Docs', '--quiet']).on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(ospath.join(destAbsDir, 'the-component/1.0/index.html'))
        .to.be.a.file()
        .with.contents.that.match(new RegExp('<title>Index Page :: Awesome Docs</title>'))
    })
  }).timeout(TIMEOUT)

  it('should allow environment variable to override properties set in playbook file', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const env = Object.assign({ URL: 'https://docs.example.com' }, process.env)
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => runAntora('generate the-site --quiet', env).on('exit', resolve)).then(
      (exitCode) => {
        expect(exitCode).to.equal(0)
        expect(ospath.join(destAbsDir, 'the-component/1.0/index.html'))
          .to.be.a.file()
          .with.contents.that.match(new RegExp('<link rel="canonical" href="https://docs.example.com/[^"]*">'))
      }
    )
  }).timeout(TIMEOUT)

  // NOTE the cli options replace the attributes defined in the playbook file
  it('should pass attributes defined using options to AsciiDoc processor', () => {
    playbookSpec.asciidoc = { attributes: { idprefix: '' } }
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const args = ['generate', 'the-site', '--attribute', 'sectanchors=~', '--attribute', 'experimental', '--quiet']
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => runAntora(args).on('exit', resolve)).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(ospath.join(destAbsDir, 'the-component/1.0/the-page.html'))
        .to.be.a.file()
        .with.contents.that.match(/<h2 id="_section_a">Section A<\/h2>/)
        .and.with.contents.that.match(/<kbd>Ctrl<\/kbd>\+<kbd>T<\/kbd>/)
    })
  }).timeout(TIMEOUT)

  it('should invoke generate command if no command is specified', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    // TODO once we have common options, we'll need to be sure they get moved before the default command
    return new Promise((resolve) =>
      runAntora('the-site.json --url https://docs.example.com --quiet').on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(ospath.join(destAbsDir, 'the-component/1.0/index.html'))
        .to.be.a.file()
        .with.contents.that.match(new RegExp('<link rel="canonical" href="https://docs.example.com/[^"]*">'))
    })
  }).timeout(TIMEOUT)

  it('should clean output directory before generating when --clean switch is used', () => {
    const residualFile = ospath.join(destAbsDir, 'the-component/1.0/old-page.html')
    fs.ensureDirSync(ospath.dirname(residualFile))
    fs.writeFileSync(residualFile, '<!DOCTYPE html><html><body>contents</body></html>')
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) => runAntora('generate the-site.json --clean --quiet').on('exit', resolve)).then(
      (exitCode) => {
        expect(exitCode).to.equal(0)
        expect(ospath.join(destAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
        expect(residualFile).not.to.be.a.path()
      }
    )
  }).timeout(TIMEOUT)

  it('should output to directory specified by --to-dir option', () => {
    // NOTE we must use a subdirectory of destDir so it gets cleaned up properly
    const betaDestDir = ospath.join(destDir, 'beta')
    const betaDestAbsDir = ospath.join(destAbsDir, 'beta')
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) =>
      runAntora(['generate', 'the-site.json', '--to-dir', betaDestDir, '--quiet']).on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(betaDestAbsDir).to.be.a.directory()
      expect(ospath.join(betaDestAbsDir, 'the-component/1.0/index.html')).to.be.a.file()
    })
  }).timeout(TIMEOUT)

  it('should discover locally installed default site generator', () => {
    const runCwd = ospath.join(WORK_DIR, 'some-other-folder')
    fs.ensureDirSync(runCwd)
    const globalModulePath = require.resolve('@antora/site-generator-default')
    const localNodeModules = ospath.join(WORK_DIR, 'node_modules')
    const localModulePath = ospath.join(localNodeModules, '@antora/site-generator-default')
    fs.ensureDirSync(localModulePath)
    const localScript = heredoc`module.exports = async (args, env) => {
      console.log('Using custom site generator')
      return require(${JSON.stringify(globalModulePath)})(args.concat('--title', 'Custom Site Generator'), env)
    }`
    fs.writeFileSync(ospath.join(localModulePath, 'generate-site.js'), localScript)
    fs.writeJsonSync(ospath.join(localModulePath, 'package.json'), { main: 'generate-site.js' }, { spaces: 2 })
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const playbookRelFile = ospath.relative(runCwd, playbookFile)
    const messages = []
    return new Promise((resolve) =>
      runAntora(['generate', playbookRelFile, '--quiet'], undefined, runCwd)
        .on('data', (data) => messages.push(data.message))
        .on('exit', resolve)
    ).then((exitCode) => {
      removeSyncForce(localNodeModules)
      expect(exitCode).to.equal(0)
      expect(messages).to.include('Using custom site generator')
      expect(destAbsDir).to.be.a.directory()
      expect(ospath.join(destAbsDir, 'the-component/1.0/index.html'))
        .to.be.a.file()
        .with.contents.that.match(new RegExp('<title>Index Page :: Custom Site Generator</title>'))
    })
  }).timeout(TIMEOUT)

  it('should show error message if require path fails to load', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // FIXME assert that exit code is 1 (limitation in Kapok when using assert)
    return runAntora('-r not-a-valid-node-module-name generate the-site')
      .assert(/error: Cannot find module/i)
      .done()
  })

  it('should show error message if site generator fails to load', () => {
    const localNodeModules = ospath.join(WORK_DIR, 'node_modules')
    const localModulePath = ospath.join(localNodeModules, '@antora/site-generator-default')
    fs.ensureDirSync(localModulePath)
    fs.writeFileSync(ospath.join(localModulePath, 'index.js'), 'throw false')
    fs.writeJsonSync(ospath.join(localModulePath, 'package.json'), { main: 'index.js' }, { spaces: 2 })
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    // FIXME assert that exit code is 1 (limitation in Kapok when using assert)
    return runAntora('generate the-site')
      .assert(/not found or failed to load/i)
      .on('exit', () => removeSyncForce(localNodeModules))
      .done()
  })

  it('should preload libraries specified using the require option', () => {
    fs.writeJsonSync(playbookFile, playbookSpec, { spaces: 2 })
    const r1 = ospath.resolve(FIXTURES_DIR, 'warming-up')
    const r2 = ospath.relative(WORK_DIR, ospath.join(FIXTURES_DIR, 'global-postprocessor'))
    // NOTE due to a bad interaction between nodegit and opal, nodegit must be required first
    const args = ['--require', 'nodegit', '--require', r1, '-r', r2, 'generate', 'the-site', '--quiet']
    const messages = []
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    return new Promise((resolve) =>
      runAntora(args)
        .on('data', (data) => messages.push(data.message))
        .on('exit', resolve)
    ).then((exitCode) => {
      expect(exitCode).to.equal(0)
      expect(messages).to.include('warming up...')
      expect(ospath.join(destAbsDir, 'the-component/1.0/the-page.html'))
        .to.be.a.file()
        .with.contents.that.match(/<p>Fin!<\/p>/)
    })
  }).timeout(TIMEOUT)
})
