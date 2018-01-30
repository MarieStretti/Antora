/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const buildPlaybook = require('@antora/playbook-builder')
const ospath = require('path')

const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')

describe('buildPlaybook()', () => {
  let schema, expectedPlaybook

  beforeEach(() => {
    schema = {
      playbook: {
        format: String,
        default: null,
        env: 'PLAYBOOK',
      },
      one: {
        one: {
          format: String,
          default: null,
          arg: 'one-one',
          env: 'ANTORA_ONE_ONE',
        },
        two: {
          format: String,
          default: 'default-value',
        },
        widget_key: {
          format: String,
          default: undefined,
          env: 'WIDGET_KEY',
        },
      },
      two: {
        format: Number,
        default: null,
        arg: 'two',
        env: 'ANTORA_TWO',
      },
      three: {
        format: Boolean,
        default: null,
        arg: 'three',
        env: 'ANTORA_THREE',
      },
      four: {
        format: Array,
        default: null,
      },
    }

    expectedPlaybook = {
      one: {
        two: 'default-value',
        widgetKey: undefined,
      },
      two: 42,
      three: false,
      four: [{ lastname: 'Lennon', name: 'John' }, { lastname: 'McCartney', name: 'Paul' }],
    }
  })

  const ymlSpec = ospath.join(FIXTURES_DIR, 'spec-sample.yml')
  const extensionlessSpec = ospath.join(FIXTURES_DIR, 'spec-sample')
  const extensionlessJsonSpec = ospath.join(FIXTURES_DIR, 'spec-sample-json')
  const extensionlessCsonSpec = ospath.join(FIXTURES_DIR, 'spec-sample-cson')
  const jsonSpec = ospath.join(FIXTURES_DIR, 'spec-sample.json')
  const csonSpec = ospath.join(FIXTURES_DIR, 'spec-sample.cson')
  const iniSpec = ospath.join(FIXTURES_DIR, 'spec-sample.ini')
  const badSpec = ospath.join(FIXTURES_DIR, 'bad-spec-sample.yml')
  const coerceValueSpec = ospath.join(FIXTURES_DIR, 'coerce-value-spec-sample.yml')
  const defaultSchemaSpec = ospath.join(FIXTURES_DIR, 'default-schema-spec-sample.yml')

  it('should throw error if no playbook spec file can be loaded', () => {
    expect(() => buildPlaybook([], {}, schema)).to.throw('not specified')
  })

  it('should set dir and file properties based on absolute path of playbook file', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: ospath.relative(process.cwd(), ymlSpec) }, schema)
    expect(playbook.dir).to.equal(ospath.dirname(ymlSpec))
    expect(playbook.file).to.equal(ymlSpec)
    expect(playbook.playbook).to.not.exist()
  })

  it('should load YML playbook spec file', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: ymlSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(ymlSpec)
    expectedPlaybook.file = ymlSpec
    expectedPlaybook.one.one = 'yml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load JSON (JSON 5) playbook spec file', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: jsonSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(jsonSpec)
    expectedPlaybook.file = jsonSpec
    expectedPlaybook.one.one = 'json-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load CSON playbook spec file', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: csonSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(csonSpec)
    expectedPlaybook.file = csonSpec
    expectedPlaybook.one.one = 'cson-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load YML playbook spec file first when no file extension is given', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: extensionlessSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(extensionlessSpec)
    expectedPlaybook.file = extensionlessSpec + '.yml'
    expectedPlaybook.one.one = 'yml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should discover JSON playbook when no file extension is given', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: extensionlessJsonSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(extensionlessJsonSpec)
    expectedPlaybook.file = extensionlessJsonSpec + '.json'
    expectedPlaybook.one.one = 'json-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should discover CSON playbook when no file extension is given', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: extensionlessCsonSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(extensionlessCsonSpec)
    expectedPlaybook.file = extensionlessCsonSpec + '.cson'
    expectedPlaybook.one.one = 'cson-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should throw error when loading unknown type file', () => {
    expect(() => buildPlaybook([], { PLAYBOOK: iniSpec }, schema)).to.throw('Unsupported file type')
  })

  it('should throw error if specified spec file does not exist', () => {
    expect(() => buildPlaybook([], { PLAYBOOK: 'non-existent/file.yml' }, schema)).to.throw('does not exist')
  })

  it('should throw error if spec file without extension cannot be resolved', () => {
    expect(() => buildPlaybook([], { PLAYBOOK: 'non-existent/file' }, schema)).to.throw('could not be resolved')
  })

  it('should use default value if spec file is not specified', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: ymlSpec }, schema)
    expect(playbook.one.two).to.equal('default-value')
  })

  it('should use env value over spec file value', () => {
    const env = { PLAYBOOK: ymlSpec, ANTORA_ONE_ONE: 'the-env-value' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.one.one).to.equal('the-env-value')
  })

  it('should use args value over spec file value or env value', () => {
    const args = ['--one-one', 'the-args-value']
    const env = { PLAYBOOK: ymlSpec, ANTORA_ONE_ONE: 'the-env-value' }
    const playbook = buildPlaybook(args, env, schema)
    expect(playbook.one.one).to.equal('the-args-value')
  })

  it('should convert properties of playbook to camelCase', () => {
    const env = { PLAYBOOK: ymlSpec, WIDGET_KEY: 'xxxyyyzzz' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.one.widgetKey).to.equal('xxxyyyzzz')
  })

  it('should coerce Number values in spec file', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: ymlSpec }, schema)
    expect(playbook.two).to.equal(42)
  })

  it('should coerce Number values in env', () => {
    const env = { PLAYBOOK: ymlSpec, ANTORA_TWO: '777' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.two).to.equal(777)
  })

  it('should coerce Number values in args', () => {
    const playbook = buildPlaybook(['--two', '777'], { PLAYBOOK: ymlSpec }, schema)
    expect(playbook.two).to.equal(777)
  })

  it('should coerce Boolean values in spec file', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: ymlSpec }, schema)
    expect(playbook.three).to.be.false()
  })

  it('should coerce Boolean values in env', () => {
    const env = { PLAYBOOK: ymlSpec, ANTORA_THREE: 'true' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.three).to.be.true()
  })

  it('should coerce Boolean values in args', () => {
    const playbook = buildPlaybook(['--three'], { PLAYBOOK: ymlSpec }, schema)
    expect(playbook.three).to.be.true()
  })

  it('should coerce a String value to an Array', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: coerceValueSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(coerceValueSpec)
    expectedPlaybook.file = coerceValueSpec
    expectedPlaybook.one.one = 'one'
    expectedPlaybook.four = ['John']
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should throw error when trying to load values not declared in the schema', () => {
    expect(() => buildPlaybook([], { PLAYBOOK: badSpec }, schema)).to.throw('not declared')
  })

  it('should throw error when spec file used values of the wrong format', () => {
    schema.two.format = String
    expect(() => buildPlaybook([], { PLAYBOOK: ymlSpec }, schema)).to.throw('must be of type String')
  })

  it('should return an immutable playbook', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: ymlSpec }, schema)
    expect(() => {
      playbook.one.two = 'override'
    }).to.throw()
  })

  it('should use default schema if none is specified', () => {
    const playbook = buildPlaybook([], { PLAYBOOK: defaultSchemaSpec })
    expect(playbook.site.url).to.equal('https://example.com')
    expect(playbook.site.title).to.equal('Example site')
    expect(playbook.site.keys.googleAnalytics).to.equal('XX-123456')
    expect(playbook.ui.bundle).to.equal('../ui/build/ui-bundles.zip')
    expect(playbook.ui.startPath).to.equal('dark-theme')
    expect(playbook.ui.outputDir).to.equal('_')
    expect(playbook.ui.defaultLayout).to.equal('default')
    expect(playbook.output.destinations).to.have.lengthOf(1)
    expect(playbook.output.dir).to.equal('_site')
    expect(playbook.output.destinations[0].provider).to.equal('archive')
    expect(playbook.output.destinations[0].path).to.equal('site.zip')
  })

  it('should be decoupled from the process environment', () => {
    const originalEnv = process.env
    process.env = { PLAYBOOK: defaultSchemaSpec }
    expect(() => buildPlaybook()).to.throw('does not exist')
    process.env = originalEnv
  })

  it('should leave the process environment unchanged', () => {
    const processArgv = process.argv
    const processEnv = process.env
    const args = ['--one-one', 'the-args-value']
    const env = { PLAYBOOK: ymlSpec, ANTORA_TWO: 99 }
    const playbook = buildPlaybook(args, env, schema)
    expect(playbook.one.one).to.equal('the-args-value')
    expect(playbook.two).to.equal(99)
    expect(playbook.three).to.equal(false)
    expect(process.argv).to.equal(processArgv)
    expect(process.env).to.equal(processEnv)
  })
})
