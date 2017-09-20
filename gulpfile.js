'use strict'

const gulp = require('gulp')

const build = require('./tasks/build-task')

gulp.task('build', build)
gulp.task('default', ['build'])
