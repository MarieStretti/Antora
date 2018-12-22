'use strict'

const { series, watch } = require('gulp')
const opts = require('yargs-parser')(process.argv.slice(2))

const lintTask = require('./tasks/lint-task')
const formatTask = require('./tasks/format-task')
const testTask = require('./tasks/test-task')

const allFiles = opts.package
  ? [`packages/${opts.package}/{lib,test}/**/*.js`]
  : ['gulpfile.js', '{lib*,scripts,tasks,test}/**/*.js', 'packages/*/{lib,test}/**/*.js']
const testFiles = opts.package
  ? [`packages/${opts.package}/test/**/*-test.js`]
  : ['test/**/*-test.js', 'packages/*/test/**/*-test.js']

const isCodeCoverageEnabled = () => process.env.COVERAGE === 'true' || process.env.CI

const lint = (done) => lintTask(allFiles).then(done)
lint.description = 'Lint the JavaScript source files using eslint'

const format = (done) => formatTask(allFiles).then(done)
format.description = 'Format on the JavaScript source files using prettier (standard profile)'

const test = (done) => testTask(testFiles, isCodeCoverageEnabled())
test.description = 'Run the test suite'

const testWatch = () => watch(allFiles, test)
testWatch.description = 'Run the test suite in response to file changes'

const build = series(test, lint)
build.description = 'Run the test suite followed by the linter'

module.exports = { lint, format, test, 'test:watch': testWatch, build, default: build }
