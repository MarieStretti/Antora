'use strict'

const convict = require('convict')
const json = require('json5')
const toml = require('@iarna/toml')
const yaml = require('js-yaml')
const { URL } = require('url')

const ARGS_SCANNER_RX = /(?:([^=,]+)|(?==))(?:,|$|=(|("|').*?\3|[^,]+)(?:,|$))/g

/**
 * A convict function wrapper that registers custom formats and parsers and
 * isolates the configuration from the process environment by default.
 */
function solitaryConvict (schema, opts) {
  registerFormats(convict)
  registerParsers(convict)
  return convict(schema, opts || { args: [], env: {} })
}

function registerParsers (convict) {
  convict.addParser([
    { extension: 'json', parse: json.parse },
    { extension: 'toml', parse: toml.parse },
    { extension: 'yaml', parse: yaml.safeLoad },
    { extension: 'yml', parse: yaml.safeLoad },
    {
      extension: '*',
      parse: () => {
        throw new Error('Unexpected playbook file type (must be yml, json, or toml')
      },
    },
  ])
}

function registerFormats (convict) {
  convict.addFormat({
    name: 'map',
    validate: (val) => {
      if (typeof val !== 'object') throw new Error('must be a map of key/value pairs')
    },
    coerce: (val, config, name) => {
      const accum = config.has(name) ? config.get(name) : {}
      let match
      ARGS_SCANNER_RX.lastIndex = 0
      while ((match = ARGS_SCANNER_RX.exec(val))) {
        const [, k, v] = match
        if (k) accum[k] = v ? (v === '-' ? '-' : yaml.safeLoad(v)) : ''
      }
      return accum
    },
  })
  convict.addFormat({
    name: 'boolean-or-string',
    validate: (val) => {
      if (!(val == null || typeof val === 'string' || val instanceof String || typeof val === 'boolean')) {
        throw new Error('must be a boolean or string')
      }
    },
  })
  convict.addFormat({
    name: 'dir-or-virtual-files',
    validate: (val) => {
      if (!(typeof val === 'string' || val instanceof String || Array.isArray(val))) {
        throw new Error('must be a directory path or list of virtual files')
      }
    },
  })
  convict.addFormat({
    name: 'url-or-pathname',
    validate: (val) => {
      if (typeof val === 'string' || val instanceof String) {
        if (val.charAt() === '/') val = 'https://example.org' + val
        let parsed
        try {
          parsed = new URL(val)
        } catch (e) {
          throw new Error('must be an absolute URL or a pathname (i.e., root-relative path)')
        }
        if (~parsed.pathname.indexOf('%20')) {
          throw new Error('must not contain spaces')
        }
      } else if (val) {
        throw new Error('must be an absolute URL or a pathname (i.e., root-relative path)')
      }
    },
  })
}

module.exports = solitaryConvict
