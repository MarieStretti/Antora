'use strict'

const vfs = require('vinyl-fs')
const mocha = require('gulp-spawn-mocha')

module.exports = (glob) =>
  vfs.src(glob, { read: false }).pipe(
    mocha({
      R: 'spec',
      istanbul: {
        report: ['lcov', 'html']
      }
    })
  )
