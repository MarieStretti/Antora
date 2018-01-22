'use strict'

const fs = require('fs-extra')
const vfs = require('vinyl-fs')
const vinylPublish = require('./common/vinyl-publish')

const { DEFAULT_DEST_FS } = require('../constants.js')

async function publishToFs (destination, files) {
  const destDir = destination.path || DEFAULT_DEST_FS
  return destination.clean
    ? fs.remove(destDir).then(() => vinylPublish(vfs.dest, destDir, files))
    : vinylPublish(vfs.dest, destDir, files)
}

module.exports = publishToFs
