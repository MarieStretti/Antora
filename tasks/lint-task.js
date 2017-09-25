'use strict'

const vfs = require('vinyl-fs')
const standard = require('gulp-standard')

module.exports = (glob) =>
  vfs
    .src(glob)
    .pipe(standard())
    .pipe(
      standard.reporter('default', {
        breakOnError: true
      })
    )
