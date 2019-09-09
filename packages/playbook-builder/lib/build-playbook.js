'use strict'

const camelCaseKeys = require('camelcase-keys')
const convict = require('./solitary-convict')
const freeze = require('deep-freeze-node')
const fs = require('fs')
const ospath = require('path')

/**
 * Builds a playbook object according to the provided schema from the specified
 * arguments and environment variables.
 *
 * Accepts an array of command line arguments (in the form of option flags and
 * switches) and a map of environment variables and translates this data into a
 * playbook object according the the specified schema. If no schema is
 * specified, the default schema provided by this package is used.
 *
 * @memberof playbook-builder
 *
 * @param {Array} [args=[]] - An array of arguments in the form of command line
 *   option flags and switches. Should begin with the first flag or switch.
 * @param {Object} [env={}] - A map of environment variables.
 * @param {Object} [schema=undefined] - A convict configuration schema.
 *
 * @returns {Object} A playbook object containing a hierarchical structure that
 *   mirrors the configuration schema. Keys in the playbook are camelCased.
 */
function buildPlaybook (args = [], env = {}, schema = undefined) {
  const config = loadConvictConfig(args, env, schema)

  const relSpecFilePath = config.get('playbook')
  if (relSpecFilePath) {
    let absSpecFilePath = ospath.resolve(relSpecFilePath)
    if (ospath.extname(absSpecFilePath)) {
      if (!fs.existsSync(absSpecFilePath)) throw new Error('playbook file does not exist')
    } else if (fs.existsSync(absSpecFilePath + '.yml')) {
      absSpecFilePath += '.yml'
    } else if (fs.existsSync(absSpecFilePath + '.json')) {
      absSpecFilePath += '.json'
    } else if (fs.existsSync(absSpecFilePath + '.toml')) {
      absSpecFilePath += '.toml'
    } else {
      throw new Error('playbook file could not be resolved')
    }
    config.loadFile(absSpecFilePath)
    if (relSpecFilePath !== absSpecFilePath) config.set('playbook', absSpecFilePath)
  }

  config.validate({ allowed: 'strict' })

  return exportModel(config)
}

function loadConvictConfig (args, env, customSchema) {
  return convict(customSchema || require('./config/schema'), { args, env })
}

function exportModel (config) {
  const schema = config.getSchema()
  const data = config.getProperties()
  if ('git' in schema.properties && 'ensureGitSuffix' in schema.properties.git.properties) {
    const git = data.git
    if (git.ensureGitSuffix != null) git.ensure_git_suffix = git.ensureGitSuffix
    delete git.ensureGitSuffix
  }
  if ('runtime' in schema.properties && 'pull' in schema.properties.runtime.properties) {
    const runtime = data.runtime
    if (runtime.pull != null) runtime.fetch = runtime.pull
    delete runtime.pull
  }
  // FIXME would be nice if camelCaseKeys could exclude a subtree (e.g., asciidoc)
  // see https://github.com/sindresorhus/camelcase-keys/issues/23
  let asciidocData
  if ('asciidoc' in schema.properties) {
    asciidocData = data.asciidoc
    delete data.asciidoc
  }
  const playbook = camelCaseKeys(data, { deep: true })
  if (asciidocData) playbook.asciidoc = asciidocData
  playbook.dir = playbook.playbook ? ospath.dirname((playbook.file = playbook.playbook)) : process.cwd()
  delete playbook.playbook
  return freeze(playbook)
}

module.exports = buildPlaybook
