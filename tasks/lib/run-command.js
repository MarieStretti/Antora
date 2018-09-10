'use strict'

const PluginError = require('plugin-error')
const spawn = require('npm-run').spawn

module.exports = (command, args, onSuccess) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('close', (code) => {
      if (code === 0) {
        if (onSuccess) onSuccess()
        return resolve()
      }
      return reject(new PluginError(`run(${command})`, 'Oops!'))
    })
  })
