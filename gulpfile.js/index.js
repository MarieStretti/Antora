'use strict'

const { series, watch } = require('gulp')
const opts = require('yargs-parser')(process.argv.slice(2))

const lintTask = require('./lint-task')
const formatTask = require('./format-task')
const testTask = require('./test-task')

const isCodeCoverageEnabled = () => process.env.COVERAGE === 'true' || process.env.CI

const allFiles = opts.package
  ? [`packages/${opts.package}/{lib,test}/**/*.js`]
  : ['{gulpfile.js,lib-example,scripts,test}/**/*.js', 'packages/*/{lib,test}/**/*.js']
const testFiles = opts.package
  ? [`packages/${opts.package}/test/**/*-test.js`]
  : ['test/**/*-test.js', 'packages/*/test/**/*-test.js']

const lint = () => lintTask(allFiles)
lint.description = 'Lint the source files using eslint (JavaScript Standard profile)'

const format = () => formatTask(allFiles)
format.description = 'Format the source files using prettier (JavaScript Standard profile)'

const test = () => testTask(testFiles, isCodeCoverageEnabled())
test.description = 'Run the test suite'

const testWatch = () => watch(allFiles, test)
testWatch.description = 'Watch files and run the test suite each time a file change is detected'

const build = series(test, lint)
build.description = 'Run the test suite followed by the linter'

module.exports = { lint, format, test, 'test:watch': testWatch, build, default: build }
