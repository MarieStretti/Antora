'use strict'

const gulp = require('gulp')

const build = require('./tasks/build-task')
const lint = require('./tasks/lint-task')

gulp.task('build', build)
gulp.task('lint', () => lint(['lib*/**/*.js', 'test/**/*.js']))
gulp.task('default', ['build'])
