'use strict'

const fs = require('fs-extra')
const ospath = require('path')
const publishStream = require('./common/publish-stream')
const { dest: vfsDest } = require('vinyl-fs')

const { DEFAULT_DEST_FS } = require('../constants.js')

async function publishToFs (config, files, playbook) {
  const destDir = ospath.resolve(playbook.dir || '.', config.path || DEFAULT_DEST_FS)
  return config.clean
    ? fs.remove(destDir).then(() => publishStream(vfsDest(destDir), files))
    : publishStream(vfsDest(destDir), files)
}

module.exports = publishToFs
