'use strict'

const gulp = require('gulp')

const lint = require('./tasks/lint-task')
const test = require('./tasks/test-task')

gulp.task('lint', () =>
  lint([
    'gulpfile.js',
    '{lib*,tasks,test}/**/*.js',
    'packages/*/{lib,test}/**/*.js'
  ])
)

gulp.task('test', ['lint'], () =>
  test(['test/**/*-test.js', 'packages/*/test/**/*-test.js'])
)

gulp.task('test-only', () =>
  test(['test/**/*-test.js', 'packages/*/test/**/*-test.js'])
)

gulp.task('default', ['test'])
