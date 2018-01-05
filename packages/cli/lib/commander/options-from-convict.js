'use strict'

require('commander').Command.prototype.optionsFromConvict = function (convictConfig, opts = {}) {
  let exclude = opts.exclude
  if (exclude && !Array.isArray(exclude)) exclude = Array(exclude)
  getOptions(convictConfig).forEach((option) => {
    if (!(exclude && exclude.includes(option.name))) {
      this.option(option.form, option.description, option.default)
    }
  })
  return this
}

function getOptions (config) {
  //return collectOptions(config._schema.properties).sort((a, b) => a.name.localeCompare(b.name))
  return collectOptions(config._schema.properties)
}

function collectOptions (properties, options = [], context = undefined) {
  return Object.entries(properties).reduce((accum, [key, value]) => {
    const path = context ? `${context}.${key}` : key
    if ('properties' in value) {
      return collectOptions(value.properties, options, path)
    } else if ('arg' in value) {
      const { arg, format, default: default_ } = value
      const option = { name: arg, form: `--${arg}`, description: value.doc, format: format }
      if (Array.isArray(format)) {
        option.form += ` <${format.join('|')}>`
        //option.form += ` <${arg.split('-').slice(-1)}>`
        //option.description += ` (${format.join(', ')})`
      } else if (format !== 'boolean') {
        option.form += ` <${arg.split('-').slice(-1)}>`
      }
      if (default_ === null) {
        option.mandatory = true
        option.description += ' (required)'
      } else if (default_ !== undefined) {
        option.default = default_
      }
      // Q why can't we use return options.concat(option)?
      options.push(option)
      return options
    }
  }, options)
}
