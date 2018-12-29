'use strict'

const { series, watch } = require('gulp')
const camelCase = (name) => name.replace(/[-]./g, (m) => m.substr(1).toUpperCase())
const exportTasks = require('./lib/export-tasks')
const opts = require('yargs-parser')(process.argv.slice(2))
const task = require('./lib/task')
const { format, lint, test } = require('require-directory')(module, './tasks', { recurse: false, rename: camelCase })

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
  desc: 'Lint JavaScript files using eslint (JavaScript Standard profile)',
  exec: lint(glob.sourceFiles),
})

const formatTask = task({
  name: 'format',
  desc: 'Format JavaScript files using prettier (JavaScript Standard profile)',
  exec: format(glob.sourceFiles),
})

const testRunTask = task({
  name: 'test:run',
  exec: test(glob.testFiles, process.env.COVERAGE === 'true' || process.env.CI),
})

const testTask = task({
  name: 'test',
  desc: 'Run the test suite',
  opts: { '--watch': 'Watch files and run the test suite whenever a file is changed' },
  exec: opts.watch ? () => watch(glob.sourceFiles, { ignoreInitial: false }, testRunTask) : testRunTask,
})

const buildTask = task({
  name: 'build',
  desc: 'Run the test suite followed by the linter',
  exec: series(testTask, lintTask),
})

module.exports = exportTasks(buildTask, lintTask, formatTask, testTask)
