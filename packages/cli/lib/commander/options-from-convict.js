'use strict'

const { Command } = require('commander')

Command.prototype.optionsFromConvict = function (convictConfig, opts = {}) {
  let exclude = opts.exclude
  if (exclude && !Array.isArray(exclude)) exclude = Array(exclude)
  getOptions(convictConfig).forEach((option) => {
    if (!(exclude && exclude.includes(option.name))) this.option(option.form, option.description, option.default)
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
      return collectOptions(value.properties, accum, path)
    } else if ('arg' in value) {
      const { arg, format, default: default_ } = value
      const option = { name: arg, form: `--${arg}`, description: value.doc, format: format }
      if (Array.isArray(format)) {
        option.form += ` <${format.join('|')}>`
        //option.form += ` <${arg.substr(arg.lastIndexOf('-') + 1, arg.length)}>`
        //option.description += ` (${format.join(', ')})`
      } else if (format !== 'boolean') {
        option.form += ` <${arg.substr(arg.lastIndexOf('-') + 1, arg.length)}>`
      }
      if (default_ === null) {
        //option.mandatory = true
        option.description += ' (required)'
      } else if (default_ && (typeof default_ !== 'object' || default_.toString() !== '[object Object]')) {
        option.default = default_
      }
      return accum.concat(option)
    } else {
      return accum
    }
  }, options)
}
