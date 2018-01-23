'use strict'

const fs = require('fs-extra')
const { dest: vfsDest } = require('vinyl-fs')
const vinylPublish = require('./common/vinyl-publish')

const { DEFAULT_DEST_FS } = require('../constants.js')

async function publishToFs (config, files) {
  const destDir = config.path || DEFAULT_DEST_FS
  return config.clean
    ? fs.remove(destDir).then(() => vinylPublish(vfsDest, destDir, files))
    : vinylPublish(vfsDest, destDir, files)
}

module.exports = publishToFs
