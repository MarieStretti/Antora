'use strict'

const { buildArtifactUrl } = require('./lib/gitlab')
const run = require('./lib/run-command')

module.exports = (files, analyzeCodeCoverage = false) => {
  const args = [...files]
  if (process.env.CI) args.unshift('--forbid-only')
  if (analyzeCodeCoverage) {
    let onSuccess
    if (process.env.GITLAB_CI) {
      const coverageReportUrl = buildArtifactUrl(
        process.env.CI_PROJECT_PATH,
        process.env.CI_JOB_ID,
        'coverage/lcov-report/index.html'
      )
      onSuccess = () => console.log('Coverage report: ' + coverageReportUrl)
    }
    args.unshift('_mocha')
    return run('nyc', args, onSuccess)
  } else {
    return run('_mocha', args)
  }
}
