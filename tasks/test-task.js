'use strict'

const { buildArtifactUrl } = require('./lib/gitlab')
const run = require('./lib/run-command')

module.exports = (files, analyzeCodeCoverage = false) => {
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
    return run('istanbul', ['cover', '_mocha', ...files], onSuccess)
  } else {
    return run('_mocha', files)
  }
}
