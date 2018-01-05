/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const fs = require('fs-extra')
const { default: Kapok } = require('kapok-js')
const path = require('path')
const RepositoryBuilder = require('../../../test/repository-builder')

const ANTORA_CLI = path.resolve(__dirname, '../bin/antora.js')
const CONTENT_REPO_DIR = path.resolve(__dirname, 'content-repo')
const CWD = process.cwd()
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const NODE = process.argv[0]
const TIMEOUT = 5000
const UI_BUNDLE_URI =
  'https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/master/raw/build/ui-bundle.zip?job=bundle-stable'
const VERSION = require('@antora/cli/package.json').version
const WORK_DIR = path.resolve(__dirname, 'work')

describe('cli', () => {
  Kapok.config.shouldShowLog = false
  let playbookSpec
  let playbookSpecFile
  let destDir
  let uiBundleUri

  const setUpFixtureRepo = () => {
    return new RepositoryBuilder(path.dirname(CONTENT_REPO_DIR), path.join(FIXTURES_DIR, 'the-component-1.0'))
      .init('content-repo').then((builder) => builder.importFixture())
  }

  before(async function () {
    await setUpFixtureRepo()
    playbookSpecFile = path.join(WORK_DIR, 'the-site.json')
    destDir = 'build/site'
    uiBundleUri = UI_BUNDLE_URI
  })

  beforeEach(() => {
    fs.emptyDirSync(path.join(WORK_DIR, destDir))
    process.chdir(WORK_DIR)
    playbookSpec = {
      site: { title: 'The Site' },
      content: {
        sources: [{ url: CONTENT_REPO_DIR, branches: 'master' }],
      },
      ui: { bundle: uiBundleUri },
    }
  })

  after(() => {
    fs.removeSync(CONTENT_REPO_DIR)
    if (process.env.KEEP_CACHE) {
      fs.removeSync(path.join(WORK_DIR, destDir.split('/')[0]))
      fs.removeSync(playbookSpecFile)
    } else {
      fs.removeSync(WORK_DIR)
    }
    process.chdir(CWD)
  })

  it('should output version when called with "-v"', () => {
    return Kapok
      // Q: why do we have to specify node and antora?
      .start(NODE, [ANTORA_CLI, '-v'])
      .assert(VERSION)
      .done()
  })

  it('should output usage when called with "-h"', () => {
    return Kapok
      .start(NODE, [ANTORA_CLI, '-h'])
      .assert(/^Usage: antora/)
      .done()
  })

  it('should show list of common options when invoked with "-h"', () => {
    return Kapok
      .start(NODE, [ANTORA_CLI, '-h'])
      .ignoreUntil(/^Options:/)
      .assert(/^ *-v, --version/)
      .done()
  })

  it('should show list of commands when invoked with "-h"', () => {
    return Kapok
      .start(NODE, [ANTORA_CLI, '-h'])
      .ignoreUntil(/^Commands:/)
      .assert(/^ *generate \[options\] <playbook>/)
      .done()
  })

  it('should show usage for generate command when invoked with "generate -h"', () => {
    return Kapok
      .start(NODE, [ANTORA_CLI, 'help', 'generate'])
      .assert(/^Usage: antora generate/)
      .done()
  })

  it('should show usage for generate command when invoked with "help generate"', () => {
    return Kapok
      .start(NODE, [ANTORA_CLI, 'help', 'generate'])
      .assert(/^Usage: antora generate/)
      .done()
  })

  it('should show options from playbook schema for generate command', () => {
    let options
    return Kapok
      .start(NODE, [ANTORA_CLI, 'generate', '-h'])
      .ignoreUntil(/^Options:/)
      // we assume the -h option is always listed last
      .joinUntil(/^ *-h, --help/, { join: '\n' })
      .assert((optionsText) => {
        options = optionsText.split('\n').reduce((accum, line) => {
          const [sig, ...dsc] = line.split('  ')
          accum[sig.trim()] = dsc.join('').trim()
          return accum
        }, {})
        return true
      })
      .done().then(() => {
        const optionForms = Object.keys(options)
        expect(optionForms).to.not.be.empty()
        expect(optionForms).to.include('--title <title>')
        expect(optionForms).to.include('--url <url>')
        expect(optionForms).to.include('--html-url-extension-style <default|drop|indexify>')
        expect(options['--html-url-extension-style <default|drop|indexify>']).to.have.string('(default: default)')
        // check for sorted option, except drop -h as it always comes last
        expect(optionForms.slice(0, -1)).to.eql(
          Object.keys(options).slice(0, -1).sort((a, b) => a.localeCompare(b))
        )
      })
  })

  it('should exit with error if generate command is run without arguments', () => {
    return Kapok
      .start(NODE, [ANTORA_CLI, 'generate'])
      .assert(/missing required argument `playbook'/)
      .done()
  })

  it.only('should generate site to output folder when playbook is passed to the generate command', async () => {
    fs.writeJsonSync(playbookSpecFile, playbookSpec)
    // Q: how do we assert w/ kapok when there's no output; use promise as workaround
    await new Promise((resolve) => {
      Kapok
        .start(NODE, [ANTORA_CLI, 'generate', 'the-site'])
        .on('exit', () => resolve())
    })
    expect(destDir).to.be.a.directory()
      .with.subDirs(['_', 'the-component'])
    expect(path.join(destDir, 'the-component'))
      .to.be.a.directory()
      .with.subDirs(['1.0'])
    expect(path.join(destDir, 'the-component/1.0/index.html')).to.be.a.file()
  }).timeout(TIMEOUT)

  it('should allow CLI option to override property set in playbook file', async () => {
    fs.writeJsonSync(playbookSpecFile, playbookSpec)
    await new Promise((resolve) => {
      Kapok
        .start(NODE, [ANTORA_CLI, 'generate', 'the-site', '--title', 'Awesome Docs'])
        .on('exit', () => resolve())
    })
    expect(path.join(destDir, 'the-component/1.0/index.html')).to.be.a.file()
      .with.contents.that.match(/<title>Index Page :: Awesome Docs<\/title>/)
  }).timeout(TIMEOUT)

  // TODO
  // * --clean
  // * --to-dir
  // * missing playbook (graceful)
})
