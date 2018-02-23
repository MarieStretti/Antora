'use strict'

const expandPath = require('@antora/expand-path-helper')
const fs = require('fs-extra')
const publishStream = require('./common/publish-stream')
const { dest: vfsDest } = require('vinyl-fs')

const { DEFAULT_DEST_FS } = require('../constants.js')

function publishToFs (config, files, playbook) {
  const destDir = expandPath(config.path || DEFAULT_DEST_FS, '~+', playbook.dir || '.')
  return config.clean
    ? fs.remove(destDir).then(() => publishStream(vfsDest(destDir), files))
    : publishStream(vfsDest(destDir), files)
}

module.exports = publishToFs
