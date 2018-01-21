'use strict'

const vinylPublish = require('./common/vinyl-publish')
const vzip = require('gulp-vinyl-zip')

const { DEFAULT_DEST_ARCHIVE } = require('../constants.js')

// FIXME right now we're assuming the archive is a zip
async function publishToArchive (destination, files) {
  return vinylPublish(vzip.dest, destination.path || DEFAULT_DEST_ARCHIVE, files)
}

module.exports = publishToArchive
