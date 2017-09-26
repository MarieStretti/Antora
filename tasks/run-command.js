'use strict'

const PluginError = require('gulp-util').PluginError
const spawn = require('npm-run').spawn

module.exports = function (command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('close', (code) => {
      if (code === 0) {
        return resolve()
      }
      return reject(new PluginError(`run(${command})`, 'Oops!'))
    })
  })
}
