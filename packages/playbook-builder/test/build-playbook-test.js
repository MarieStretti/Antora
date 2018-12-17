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
        default: undefined,
        env: 'ANTORA_PLAYBOOK',
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
      stuff: {
        format: 'map',
        default: {},
        arg: 'stuff',
        env: 'STUFF',
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
      stuff: {},
    }
  })

  const ymlSpec = ospath.join(FIXTURES_DIR, 'spec-sample.yml')
  const yamlSpec = ospath.join(FIXTURES_DIR, 'spec-sample.yaml')
  const extensionlessSpec = ospath.join(FIXTURES_DIR, 'spec-sample')
  const extensionlessJsonSpec = ospath.join(FIXTURES_DIR, 'spec-sample-json')
  const extensionlessTomlSpec = ospath.join(FIXTURES_DIR, 'spec-sample-toml')
  const jsonSpec = ospath.join(FIXTURES_DIR, 'spec-sample.json')
  const tomlSpec = ospath.join(FIXTURES_DIR, 'spec-sample.toml')
  const iniSpec = ospath.join(FIXTURES_DIR, 'spec-sample.ini')
  const badSpec = ospath.join(FIXTURES_DIR, 'bad-spec-sample.yml')
  const coerceValueSpec = ospath.join(FIXTURES_DIR, 'coerce-value-spec-sample.yml')
  const invalidMapSpec = ospath.join(FIXTURES_DIR, 'invalid-map-spec-sample.yml')
  const invalidDirOrFilesSpec = ospath.join(FIXTURES_DIR, 'invalid-dir-or-files-spec-sample.yml')
  const legacyUiBundleSpec = ospath.join(FIXTURES_DIR, 'legacy-ui-bundle-sample.yml')
  const legacyUiStartPathSpec = ospath.join(FIXTURES_DIR, 'legacy-ui-start-path-sample.yml')
  const defaultSchemaSpec = ospath.join(FIXTURES_DIR, 'default-schema-spec-sample.yml')

  it('should set dir to process.cwd() when playbook file is not specified', () => {
    const playbook = buildPlaybook([], {}, { playbook: { format: String, default: undefined } })
    expect(playbook.dir).to.equal(process.cwd())
    expect(playbook.file).to.not.exist()
  })

  it('should set dir and file properties based on absolute path of playbook file', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: ospath.relative('.', ymlSpec) }, schema)
    expect(playbook.dir).to.equal(ospath.dirname(ymlSpec))
    expect(playbook.file).to.equal(ymlSpec)
    expect(playbook.playbook).to.not.exist()
  })

  it('should load YAML playbook file with .yml extension', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(ymlSpec)
    expectedPlaybook.file = ymlSpec
    expectedPlaybook.one.one = 'yml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load YAML playbook file with .yaml extension', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: yamlSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(yamlSpec)
    expectedPlaybook.file = yamlSpec
    expectedPlaybook.one.one = 'yaml-spec-value-one'
    expectedPlaybook.four = [{ lastname: 'Starr', name: 'Ringo' }, { lastname: 'Harrison', name: 'George' }]
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load JSON (JSON 5) playbook file', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: jsonSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(jsonSpec)
    expectedPlaybook.file = jsonSpec
    expectedPlaybook.one.one = 'json-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load TOML playbook file', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: tomlSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(tomlSpec)
    expectedPlaybook.file = tomlSpec
    expectedPlaybook.one.one = 'toml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should load YAML playbook file first when no file extension is given', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: extensionlessSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(extensionlessSpec)
    expectedPlaybook.file = extensionlessSpec + '.yml'
    expectedPlaybook.one.one = 'yml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should discover JSON playbook when no file extension is given', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: extensionlessJsonSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(extensionlessJsonSpec)
    expectedPlaybook.file = extensionlessJsonSpec + '.json'
    expectedPlaybook.one.one = 'json-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should discover TOML playbook when no file extension is given', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: extensionlessTomlSpec }, schema)
    expectedPlaybook.dir = ospath.dirname(extensionlessTomlSpec)
    expectedPlaybook.file = extensionlessTomlSpec + '.toml'
    expectedPlaybook.one.one = 'toml-spec-value-one'
    expect(playbook).to.eql(expectedPlaybook)
  })

  it('should throw error when loading unknown type file', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: iniSpec }, schema)).to.throw('Unexpected playbook file type')
  })

  it('should throw error if specified playbook file does not exist', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: 'non-existent/file.yml' }, schema)).to.throw('does not exist')
  })

  it('should throw error if playbook file without extension cannot be resolved', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: 'non-existent/file' }, schema)).to.throw('could not be resolved')
  })

  it('should use default value if playbook file is not specified', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expect(playbook.one.two).to.equal('default-value')
  })

  it('should use env value over value in playbook file', () => {
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_ONE_ONE: 'the-env-value' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.one.one).to.equal('the-env-value')
  })

  it('should use env value over value in playbook file when env value is empty string', () => {
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_ONE_ONE: '' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.one.one).to.equal('')
  })

  it('should use args value over value in playbook file or env value even if value is falsy', () => {
    const args = ['--one-one', 'the-args-value']
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_ONE_ONE: 'the-env-value' }
    const playbook = buildPlaybook(args, env, schema)
    expect(playbook.one.one).to.equal('the-args-value')
  })

  it('should use arg value over value in playbook file when arg value is falsy', () => {
    const args = ['--two', '0']
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_TWO: '47' }
    const playbook = buildPlaybook(args, env, schema)
    expect(playbook.two).to.equal(0)
  })

  it('should convert properties of playbook to camelCase', () => {
    const env = { ANTORA_PLAYBOOK: ymlSpec, WIDGET_KEY: 'xxxyyyzzz' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.one.widgetKey).to.equal('xxxyyyzzz')
  })

  it('should coerce Number values in playbook file', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expect(playbook.two).to.equal(42)
  })

  it('should coerce Number values in env', () => {
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_TWO: '777' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.two).to.equal(777)
  })

  it('should use env value over value in playbook file when env value is falsy', () => {
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_TWO: '0' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.two).to.equal(0)
  })

  it('should coerce Number values in args', () => {
    const playbook = buildPlaybook(['--two', '777'], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expect(playbook.two).to.equal(777)
  })

  it('should coerce Boolean values in playbook file', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expect(playbook.three).to.be.false()
  })

  it('should coerce Boolean values in env', () => {
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_THREE: 'true' }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.three).to.be.true()
  })

  it('should coerce Boolean values in args', () => {
    const playbook = buildPlaybook(['--three'], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expect(playbook.three).to.be.true()
  })

  it('should coerce map value in playbook file', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: coerceValueSpec }, schema)
    expect(playbook.stuff).to.eql({ key: 'val', foo: 'bar', nada: null, yep: true, nope: false })
  })

  it('should coerce map value in env', () => {
    const val = 'key=val,keyonly,=valonly,empty=,tilde="~",tags="a,b,c",nada=~,y=true,n=false'
    const env = { ANTORA_PLAYBOOK: ymlSpec, STUFF: val }
    const playbook = buildPlaybook([], env, schema)
    expect(playbook.stuff).to.eql({
      key: 'val',
      keyonly: '',
      empty: '',
      tilde: '~',
      tags: 'a,b,c',
      nada: null,
      y: true,
      n: false,
    })
  })

  it('should coerce map value in args', () => {
    const playbook = buildPlaybook(
      [
        '--stuff',
        'key=val',
        '--stuff',
        'keyonly',
        '--stuff',
        '=valonly',
        '--stuff',
        'empty=',
        '--stuff',
        'tilde="~"',
        '--stuff',
        'tags="a,b,c"',
        '--stuff',
        'nada=~',
        '--stuff',
        'y=true',
        '--stuff',
        'n=false',
      ],
      { ANTORA_PLAYBOOK: ymlSpec },
      schema
    )
    expect(playbook.stuff).to.eql({
      key: 'val',
      keyonly: '',
      empty: '',
      tilde: '~',
      tags: 'a,b,c',
      nada: null,
      y: true,
      n: false,
    })
  })

  it('should use map value in args to update map value from playbook file', () => {
    const playbook = buildPlaybook(['--stuff', 'foo=baz'], { ANTORA_PLAYBOOK: coerceValueSpec }, schema)
    expect(playbook.stuff.key).to.equal('val')
    expect(playbook.stuff.foo).to.equal('baz')
  })

  it('should update map value from playbook file with map values in args when name is asciidoc.attributes', () => {
    const args = ['--attribute', 'idprefix=user-', '--attribute', 'idseparator=-']
    const playbook = buildPlaybook(args, { ANTORA_PLAYBOOK: defaultSchemaSpec })
    expect(playbook.asciidoc.attributes).to.eql({
      'allow-uri-read': true,
      idprefix: 'user-',
      idseparator: '-',
      toc: false,
      'uri-project': 'https://antora.org',
    })
  })

  it('should throw error if value of object key is not an object', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: invalidMapSpec }, schema)).to.throw('must be a map')
  })

  it('should coerce String value to Array', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: coerceValueSpec }, schema)
    expect(playbook.file).to.equal(coerceValueSpec)
    expect(playbook.dir).to.equal(ospath.dirname(coerceValueSpec))
    expect(playbook.one.one).to.equal('one')
    expect(playbook.four).to.eql(['John'])
  })

  it('should throw error if dir-or-virtual-files key is not a string or array', () => {
    Object.keys(schema).forEach((key) => {
      if (key !== 'playbook') delete schema[key]
    })
    schema.files = {
      format: 'dir-or-virtual-files',
      default: undefined,
    }
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: invalidDirOrFilesSpec }, schema)).to.throw(
      'must be a directory path or list of virtual files'
    )
  })

  it('should throw error when trying to load values not declared in the schema', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: badSpec }, schema)).to.throw('not declared')
  })

  it('should throw error when playbook file uses values of the wrong format', () => {
    schema.two.format = String
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: ymlSpec }, schema)).to.throw('must be of type String')
  })

  it('should return an immutable playbook', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: ymlSpec }, schema)
    expect(() => {
      playbook.one.two = 'override'
    }).to.throw()
  })

  it('should use default schema if no schema is specified', () => {
    const playbook = buildPlaybook([], { ANTORA_PLAYBOOK: defaultSchemaSpec })
    expect(playbook.runtime.cacheDir).to.equal('./.antora-cache')
    expect(playbook.runtime.pull).to.equal(true)
    expect(playbook.runtime.quiet).to.equal(false)
    expect(playbook.runtime.silent).to.equal(false)
    expect(playbook.site.url).to.equal('https://example.com')
    expect(playbook.site.title).to.equal('Example site')
    expect(playbook.site.startPage).to.equal('1.0@server::intro')
    expect(playbook.site.keys.googleAnalytics).to.equal('XX-123456')
    expect(playbook.content.branches).to.eql(['v*'])
    expect(playbook.content.sources).to.have.lengthOf(1)
    expect(playbook.content.sources[0]).to.eql({
      url: 'https://gitlab.com/antora/demo/demo-component-a.git',
      branches: ['master', 'v*'],
    })
    expect(playbook.ui.bundle.url).to.equal('./../ui/build/ui-bundles.zip')
    expect(playbook.ui.bundle.startPath).to.equal('dark-theme')
    expect(playbook.ui.outputDir).to.equal('_')
    expect(playbook.ui.defaultLayout).to.equal('default')
    expect(playbook.ui.supplementalFiles).to.have.lengthOf(1)
    expect(playbook.ui.supplementalFiles[0]).to.eql({
      path: 'head-meta.hbs',
      contents: '<link rel="stylesheet" href="https://example.org/shared.css">',
    })
    expect(playbook.asciidoc.attributes).to.eql({
      'allow-uri-read': true,
      idprefix: '',
      toc: false,
      'uri-project': 'https://antora.org',
    })
    expect(playbook.asciidoc.extensions).to.eql(['asciidoctor-plantuml', './lib/shout-block'])
    expect(playbook.git.credentials.path).to.equal('./.git-credentials')
    expect(playbook.urls.htmlExtensionStyle).to.equal('indexify')
    expect(playbook.urls.redirectFacility).to.equal('nginx')
    expect(playbook.output.destinations).to.have.lengthOf(1)
    expect(playbook.output.dir).to.equal('./_site')
    expect(playbook.output.destinations[0].provider).to.equal('archive')
    expect(playbook.output.destinations[0].path).to.equal('./site.zip')
  })

  it('should not migrate playbook data that defines ui.bundle as a String', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: legacyUiBundleSpec })).to.throw(/not declared in the schema/)
  })

  it('should not migrate playbook data that defines ui.start_path', () => {
    expect(() => buildPlaybook([], { ANTORA_PLAYBOOK: legacyUiStartPathSpec })).to.throw(/not declared in the schema/)
  })

  it('should throw if no configuration data is given', () => {
    expect(() => buildPlaybook()).to.throw()
  })

  it('should be decoupled from the process environment', () => {
    const originalEnv = process.env
    process.env = { ANTORA_PLAYBOOK: 'no-such-file' }
    expect(() => buildPlaybook(['--ui-bundle-url', 'ui-bundle.zip'])).to.not.throw()
    process.env = originalEnv
  })

  it('should leave the process environment unchanged', () => {
    const processArgv = process.argv
    const processEnv = process.env
    const args = ['--one-one', 'the-args-value']
    const env = { ANTORA_PLAYBOOK: ymlSpec, ANTORA_TWO: 99 }
    const playbook = buildPlaybook(args, env, schema)
    expect(playbook.one.one).to.equal('the-args-value')
    expect(playbook.two).to.equal(99)
    expect(playbook.three).to.equal(false)
    expect(process.argv).to.equal(processArgv)
    expect(process.env).to.equal(processEnv)
  })
})
