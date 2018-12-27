'use strict'

const { series, watch } = require('gulp')
const camelcase = (name) => name.replace(/[-]./g, (m) => m.substr(1).toUpperCase())
const exportTasks = require('./lib/export-tasks')
const opts = require('yargs-parser')(process.argv.slice(2))
const task = require('./lib/task')
const { format, lint, test } = require('require-directory')(module, '.', { recurse: false, rename: camelcase })

const glob = opts.package
  ? {
    sourceFiles: [`packages/${opts.package}/{lib,test}/**/*.js`],
    testFiles: [`packages/${opts.package}/test/**/*-test.js`],
  }
  : {
    sourceFiles: ['{gulpfile.js,lib-example,scripts,test}/**/*.js', 'packages/*/{lib,test}/**/*.js'],
    testFiles: ['test/**/*-test.js', 'packages/*/test/**/*-test.js'],
  }

const lintTask = task({
  name: 'lint',
  desc: 'Lint source files using eslint (JavaScript Standard profile)',
  exec: lint(glob.sourceFiles),
})

const formatTask = task({
  name: 'format',
  desc: 'Format source files using prettier (JavaScript Standard profile)',
  exec: format(glob.sourceFiles),
})

const testTask = task({
  name: 'test',
  desc: 'Run the test suite',
  exec: test(glob.testFiles, process.env.COVERAGE === 'true' || process.env.CI),
})

const testWatchTask = task({
  name: 'test:watch',
  desc: 'Watch files and run the test suite each time a file change is detected',
  exec: () => watch(glob.sourceFiles, testTask),
})

const buildTask = task({
  name: 'build',
  desc: 'Run the test suite followed by the linter',
  exec: series(testTask, lintTask),
})

module.exports = exportTasks(buildTask, lintTask, formatTask, testTask, testWatchTask)
