const fs = require('fs')
const path = require('path')
const convict = require('convict')
const deepFreeze = require('deep-freeze')
const defaultSchema = require('./config/schema')
const yaml = require('js-yaml')
const cson = require('cson-parser')

function getConvictConfig (customSchema) {
  if (customSchema != null) {
    return convict(customSchema)
  }

  return convict(defaultSchema)
}

function loadSpecFile (specPath) {
  const specExtname = path.extname(specPath)
  const fileContents = fs.readFileSync(specPath, 'utf8')

  if (specExtname === '.yml') {
    return yaml.safeLoad(fileContents)
  }

  if (specExtname === '.json') {
    return JSON.parse(fileContents)
  }

  if (specExtname === '.cson') {
    return cson.parse(fileContents)
  }

  throw new Error('Unknown file type')
}

module.exports = (customSchema) => {
  const config = getConvictConfig(customSchema)
  const specRelativePath = config.get('playbook')

  if (specRelativePath == null) {
    throw new Error('Playbook spec file cannot be found')
  }

  let specPath = path.resolve(process.cwd(), specRelativePath)
  // assume implicit .yml extension
  if (path.extname(specPath) === '') {
    specPath += '.yml'
  }

  const spec = loadSpecFile(specPath)
  config.load(spec)
  config.validate({ allowed: 'strict' })

  const playbook = config.getProperties()
  // playbook path property should not leak
  delete playbook.playbook
  const frozenPlaybook = deepFreeze(playbook)

  return frozenPlaybook
}
