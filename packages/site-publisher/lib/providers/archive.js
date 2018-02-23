'use strict'

const expandPath = require('@antora/expand-path-helper')
const publishStream = require('./common/publish-stream')
const { dest: vzipDest } = require('gulp-vinyl-zip')

const { DEFAULT_DEST_ARCHIVE } = require('../constants.js')

// FIXME right now we're assuming the archive is a zip
function publishToArchive (config, files, playbook) {
  const destFile = expandPath(config.path || DEFAULT_DEST_ARCHIVE, '~+', playbook.dir || '.')
  return publishStream(vzipDest(destFile), files)
}

module.exports = publishToArchive
