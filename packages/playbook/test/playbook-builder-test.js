/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')
const buildPlaybook = require('../lib/playbook-builder')

const path = require('path')

describe('buildPlaybook()', () => {
  let originalEnv
  let originalArgv
  let schema
  let expectedPlaybook

  beforeEach(() => {
    originalArgv = process.argv
    originalEnv = process.env
    process.argv = ['/path/to/node', '/path/to/script.js']
    process.env = {}

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
          arg: 'oneone',
          env: 'ANTORA_ONEONE',
        },
        two: {
          format: String,
          default: 'default-value',
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
      },
      two: 42,
      three: false,
      four: [{ lastname: 'Lennon', name: 'John' }, { lastname: 'McCartney', name: 'Paul' }],
    }
  })

  afterEach(() => {
    process.argv = originalArgv
    process.env = originalEnv
  })

  const ymlSpec = path.resolve(__dirname, 'fixtures', 'spec-sample.yml')
  const extensionLessSpec = path.resolve(__dirname, 'fixtures', 'spec-sample')
  const jsonSpec = path.resolve(__dirname, 'fixtures', 'spec-sample.json')
  const csonSpec = path.resolve(__dirname, 'fixtures', 'spec-sample.cson')
  const iniSpec = path.resolve(__dirname, 'fixtures', 'spec-sample.ini')
  const badSpec = path.resolve(__dirname, 'fixtures', 'bad-spec-sample.yml')
  const coerceValueSpec = path.resolve(__dirname, 'fixtures', 'coerce-value-spec-sample.yml')
  const defaultSchemaSpec = path.resolve(__dirname, 'fixtures', 'default-schema-spec-sample.yml')

  it('should throw error if no playbook spec file can be loaded', () => {
    expect(() => buildPlaybook(schema)).to.throw()
  })

  it('should load YML playbook spec file', () => {
    process.env.PLAYBOOK = ymlSpec
    const playbook = buildPlaybook(schema)
    expectedPlaybook.one.one = 'yml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load YML playbook spec file when no file extension is given', () => {
    process.env.PLAYBOOK = extensionLessSpec
    const playbook = buildPlaybook(schema)
    expectedPlaybook.one.one = 'yml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load JSON playbook spec file', () => {
    process.env.PLAYBOOK = jsonSpec
    const playbook = buildPlaybook(schema)
    expectedPlaybook.one.one = 'json-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load CSON playbook spec file', () => {
    process.env.PLAYBOOK = csonSpec
    const playbook = buildPlaybook(schema)
    expectedPlaybook.one.one = 'cson-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should throw error when loading unknown type file', () => {
    process.env.PLAYBOOK = iniSpec
    expect(() => buildPlaybook(schema)).to.throw()
  })

  it('should throw error if spec file is specified but cannot be found', () => {
    process.env.PLAYBOOK = 'file/not/found.yml'
    expect(() => buildPlaybook(schema)).to.throw()
  })

  it('should use default value if spec file is not specified', () => {
    process.env.PLAYBOOK = ymlSpec
    const playbook = buildPlaybook(schema)
    expect(playbook.one.two).to.equal('default-value')
  })

  it('should use env value over spec file value', () => {
    process.env.PLAYBOOK = ymlSpec
    process.env.ANTORA_ONEONE = 'the-env-value'
    const playbook = buildPlaybook(schema)
    expect(playbook.one.one).to.equal('the-env-value')
  })

  it('should use argv value over spec file value or env value', () => {
    process.env.PLAYBOOK = ymlSpec
    process.argv.push('--oneone', 'the-argv-value')
    process.env.ANTORA_ONEONE = 'the-env-value'
    const playbook = buildPlaybook(schema)
    expect(playbook.one.one).to.equal('the-argv-value')
  })

  it('should coerce Number values', () => {
    process.env.PLAYBOOK = ymlSpec
    const playbook = buildPlaybook(schema)
    expect(playbook.two).to.equal(42)
  })

  it('should coerce Number values (via env)', () => {
    process.env.PLAYBOOK = ymlSpec
    process.env.ANTORA_TWO = '777'
    const playbook = buildPlaybook(schema)
    expect(playbook.two).to.equal(777)
  })

  it('should coerce Number values (via argv)', () => {
    process.env.PLAYBOOK = ymlSpec
    process.argv.push('--two', '777')
    const playbook = buildPlaybook(schema)
    expect(playbook.two).to.equal(777)
  })

  it('should coerce Boolean values', () => {
    process.env.PLAYBOOK = ymlSpec
    const playbook = buildPlaybook(schema)
    expect(playbook.three).to.be.false()
  })

  it('should coerce Boolean values (via env)', () => {
    process.env.PLAYBOOK = ymlSpec
    process.env.ANTORA_THREE = 'true'
    const playbook = buildPlaybook(schema)
    expect(playbook.three).to.be.true()
  })

  it('should coerce Boolean values (via argv)', () => {
    process.env.PLAYBOOK = ymlSpec
    process.argv.push('--three')
    const playbook = buildPlaybook(schema)
    expect(playbook.three).to.be.true()
  })

  it('should throw error when trying to load values not declared in the schema', () => {
    process.env.PLAYBOOK = badSpec
    expect(() => buildPlaybook(schema)).to.throw()
  })

  it('should throw error when spec file used values of the wrong format', () => {
    process.env.PLAYBOOK = ymlSpec
    schema.two.format = String
    expect(() => buildPlaybook(schema)).to.throw()
  })

  it('should return an immutable playbook', () => {
    process.env.PLAYBOOK = ymlSpec
    const playbook = buildPlaybook(schema)
    expect(() => {
      playbook.one.two = 'override'
    }).to.throw()
  })

  it('should use default schema if none is specified', () => {
    process.env.PLAYBOOK = defaultSchemaSpec
    const playbook = buildPlaybook()
    expect(playbook.site.url).to.equal('https://example.com')
    expect(playbook.site.title).to.equal('Example site')
  })

  it('should coerce a String value to an Array', () => {
    process.env.PLAYBOOK = coerceValueSpec
    const playbook = buildPlaybook(schema)
    expectedPlaybook.one.one = 'one'
    expectedPlaybook.four = ['John']
    expect(playbook).to.eql(expectedPlaybook)
  })
})
