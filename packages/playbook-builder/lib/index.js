'use strict'

const convict = require('./solitary-convict')
const cson = require('cson-parser')
const freeze = require('deep-freeze')
const fs = require('fs')
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
      return JSON.parse(data)
    case '.cson':
      return cson.parse(data)
    default:
      throw new Error('Unsupported file type')
  }
}

module.exports = (args, env, schema) => {
  const config = loadConvictConfig(args, env, schema)

  const specFileRelPath = config.get('playbook')
  if (!specFileRelPath) {
    throw new Error('Spec file for playbook not specified')
  }

  let specFileAbsPath = path.resolve(process.cwd(), specFileRelPath)
  if (!path.extname(specFileAbsPath)) specFileAbsPath += '.yml'

  config.load(parseSpecFile(specFileAbsPath))
  config.validate({ allowed: 'strict' })

  const playbook = config.getProperties()
  // playbook property is private; should not leak
  delete playbook.playbook
  return freeze(playbook)
}
