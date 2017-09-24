'use strict'

const gulp = require('gulp')

const lint = require('./tasks/lint-task')
const test = require('./tasks/test-task')

gulp.task('lint', () => lint(['lib*/**/*.js', 'test/**/*.js']))
gulp.task('test', ['lint'], () => test(['test/**/*-test.js']))
gulp.task('test-only', () => test(['test/**/*-test.js']))
gulp.task('default', ['test'])
