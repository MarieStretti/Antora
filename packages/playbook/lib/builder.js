const fs = require('fs')
const path = require('path')
const convict = require('convict')
const yaml = require('js-yaml')
const cson = require('cson-parser')
const Playbook = require('./model/playbook')

// Load the configuration schema for convict.
function loadConfigSchema () {
  const schema = require('./config/schema')
  // dispatch an event to allow plugins to contribute to this schema
  return schema
}

function readConfig (schema) {
  return convict(schema)
}

// TODO support both yaml and cson; automatically detect matching files
function loadPlaybookSpec (config, specPath) {
  let extname = path.extname(specPath)
  if (extname.length === 0) {
    if (fs.existsSync(specPath + '.yml')) {
      specPath += (extname = '.yml')
    } else if (fs.existsSync(specPath + '.cson')) {
      specPath += (extname = '.cson')
    }
  }
  // QUESTION should we raise exception if playbook spec doesn't exist?
  if (extname === '.yml') {
    config.load(yaml.safeLoad(fs.readFileSync(specPath, 'utf8')))
    config.set('playbook', specPath)
  } else if (extname === '.cson') {
    config.load(cson.parse(fs.readFileSync(specPath, 'utf8')))
    config.set('playbook', specPath)
  }
}

// Convert the convict config into the playbook model
function buildPlaybook (config) {
  const playbook = new Playbook(config)
  // dispatch an event to allow plugins to contribute to the model
  return playbook
}

module.exports = {
  load: (argv, env) => {
    // pretend like convict supports custom argv and env args; perhaps move to a module "solitaryConvict"
    const prevArgv = process.argv
    const prevEnv = process.env
    process.argv = argv
    process.env = env
    const config = readConfig(loadConfigSchema())
    process.argv = prevArgv
    process.env = prevEnv
    const playbookSpecPath = config.get('playbook')
    if (playbookSpecPath) {
      loadPlaybookSpec(config, playbookSpecPath)
    }
    return buildPlaybook(config)
  }
}
