'use strict'

const camelCaseKeys = require('camelcase-keys')
const convict = require('./solitary-convict')
const cson = require('cson-parser')
const freezeDeep = require('deep-freeze')
const fs = require('fs')
const json = require('json5')
const path = require('path')
const yaml = require('js-yaml')

const loadConvictConfig = (args, env, customSchema) =>
  convict(customSchema || require('./config/schema'), { args: args, env: env })

const parseSpecFile = (specFilePath) => {
  const data = fs.readFileSync(specFilePath, 'utf8')

  switch (path.extname(specFilePath)) {
    case '.yml':
      return yaml.safeLoad(data)
    case '.json':
      return json.parse(data)
    case '.cson':
      return cson.parse(data)
    default:
      throw new Error('Unsupported file type')
  }
}

const exportPlaybookModel = (config) => {
  const playbook = camelCaseKeys(config.getProperties(), { deep: true })
  // playbook property is private; should not leak
  delete playbook.playbook
  return freezeDeep(playbook)
}

module.exports = (args, env, schema) => {
  const config = loadConvictConfig(args, env, schema)

  const specFileRelPath = config.get('playbook')
  if (specFileRelPath) {
    let specFileAbsPath = path.resolve(process.cwd(), specFileRelPath)
    if (path.extname(specFileAbsPath)) {
      if (!fs.existsSync(specFileAbsPath)) throw new Error('playbook spec file does not exist')
    } else if (fs.existsSync(specFileAbsPath + '.yml')) {
      specFileAbsPath += '.yml'
    } else if (fs.existsSync(specFileAbsPath + '.json')) {
      specFileAbsPath += '.json'
    } else if (fs.existsSync(specFileAbsPath + '.cson')) {
      specFileAbsPath += '.cson'
    } else {
      throw new Error('playbook spec file could not be resolved')
    }
    config.load(parseSpecFile(specFileAbsPath))
  } else {
    throw new Error('playbook spec file was not specified')
  }

  config.validate({ allowed: 'strict' })

  return exportPlaybookModel(config)
}
