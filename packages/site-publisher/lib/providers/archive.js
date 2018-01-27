'use strict'

const publishStream = require('./common/publish-stream')
const { dest: vzipDest } = require('gulp-vinyl-zip')

const { DEFAULT_DEST_ARCHIVE } = require('../constants.js')

// FIXME right now we're assuming the archive is a zip
async function publishToArchive (config, files) {
  return publishStream(vzipDest(config.path || DEFAULT_DEST_ARCHIVE), files)
}

module.exports = publishToArchive
