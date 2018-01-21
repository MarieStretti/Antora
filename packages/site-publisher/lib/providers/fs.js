'use strict'

const vfs = require('vinyl-fs')
const vinylPublish = require('./common/vinyl-publish')

const { DEFAULT_DEST_FS } = require('../constants.js')

async function publishToFs (destination, files) {
  return vinylPublish(vfs.dest, destination.path || DEFAULT_DEST_FS, files)
}

module.exports = publishToFs
