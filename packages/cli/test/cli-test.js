/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const fs = require('fs-extra')
const { default: Kapok } = require('kapok-js')
const git = require('nodegit')
const path = require('path')

const ANTORA_CLI = path.resolve(__dirname, '../bin/antora.js')
const CWD = process.cwd()
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const NODE = process.argv[0]
const PROJECT_DIR = path.resolve(__dirname, '../../..')
const TIMEOUT = 5000
const UI_BUNDLE_URI =
  'https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/master/raw/build/ui-bundle.zip?job=bundle-stable'
const VERSION = require('@antora/cli/package.json').version
const WORK_DIR = path.resolve(__dirname, 'work')

describe('cli', () => {
  Kapok.config.shouldShowLog = false
  let currentBranch
  let startPath
  let playbookSpec
  let playbookSpecFile
  let destDir
  let uiBundleUri

  const getCurrentBranch = async () => {
    const repo = await git.Repository.open(PROJECT_DIR)
    const result = (await repo.getCurrentBranch()).name().replace(/^.+\//, '')
    repo.free()
    return result
  }

  before(async function () {
    currentBranch = await getCurrentBranch()
    startPath = path.relative(PROJECT_DIR, path.join(FIXTURES_DIR, 'the-component-1.0'))
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
        sources: [{ url: PROJECT_DIR, branches: currentBranch, start_path: startPath }],
      },
      ui: { bundle: uiBundleUri },
    }
  })

  after(() => {
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

  it('should generate site to output folder when playbook is passed to the generate command', async () => {
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
