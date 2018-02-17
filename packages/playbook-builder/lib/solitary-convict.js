'use strict'

const convict = require('convict')

/**
 * A convict function wrapper that decouples it from the process environment.
 * This wrapper allows the args array and env map to be specified as options.
 */
function solitaryConvict (schema, opts = {}) {
  let processArgv
  let args = opts.args || []
  processArgv = process.argv
  // NOTE convict expects first two arguments to be node command and script filename
  let argv = processArgv.slice(0, 2).concat(args)
  process.argv = argv

  let processEnv
  let env = opts.env || {}
  processEnv = process.env
  process.env = env

  const config = convict(schema)

  process.argv = processArgv
  process.env = processEnv

  const originalLoad = config.load
  config.load = function (configOverlay) {
    process.argv = argv
    process.env = env
    const combinedConfig = originalLoad.apply(this, [configOverlay])
    process.argv = processArgv
    process.env = processEnv
    return combinedConfig
  }

  return config
}

solitaryConvict.addFormat = (name, validate, coerce) => convict.addFormat(name, validate, coerce)

module.exports = solitaryConvict
