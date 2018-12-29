'use strict'

const metadata = require('undertaker/lib/helpers/metadata')

module.exports = ({ name, desc, opts, exec: fn }) => {
  if (name) {
    const displayName = fn.displayName
    if (displayName === '<series>' || displayName === '<parallel>') {
      metadata.get(fn).tree.label = `${displayName} ${name}`
    }
    fn.displayName = name
  }
  if (desc) fn.description = desc
  if (opts) fn.flags = opts
  return fn
}
