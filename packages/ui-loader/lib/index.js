'use strict'

const crypto = require('crypto')
const path = require('path')

const _ = require('lodash')
const buffer = require('gulp-buffer')
const download = require('download')
const fs = require('fs-extra')
const streamToArray = require('stream-to-array')
const yaml = require('js-yaml')
const zip = require('gulp-vinyl-zip')

const minimatchAll = require('minimatch-all')

const $files = Symbol('$files')
const $filesIndex = Symbol('$filesIndex')

class UiCatalog {
  constructor () {
    this[$files] = []
    this[$filesIndex] = {}
  }

  getFiles () {
    return this[$files]
  }

  addFile (file) {
    const id = [file.type, ...file.path.split('/')]
    if (_.get(this[$filesIndex], id) != null) {
      throw new Error('Duplicate file')
    }
    _.set(this[$filesIndex], id, file)
    this[$files].push(file)
  }

  findByType (type) {
    return _.filter(this[$files], { type })
  }
}

const localCachePath = path.resolve('.ui-cache')

module.exports = async (playbook) => {
  const uiCatalog = new UiCatalog()

  let zipPath
  if (isRemote(playbook.ui.bundle)) {
    const bundleSha1 = sha1(playbook.ui.bundle)
    zipPath = path.join(localCachePath, bundleSha1 + '.zip')
    const alreadyCached = await fs.pathExists(zipPath)
    if (!alreadyCached) {
      const bundle = await download(playbook.ui.bundle)
      await fs.ensureDir(localCachePath)
      fs.writeFileSync(zipPath, bundle)
    }
  } else {
    zipPath = path.join(process.cwd(), playbook.ui.bundle)
  }

  const zipFilesAndDirsStream = zip.src(zipPath).pipe(buffer())

  const zipFilesAndDirs = await streamToArray(zipFilesAndDirsStream)
  const uiFiles = getFilesInStartPath(zipFilesAndDirs, playbook.ui.startPath)
  const { uiDesc, uiDescFile } = readUiDesc(uiFiles)

  let staticFiles
  if (uiDesc != null) {
    if ((staticFiles = uiDesc.staticFiles) != null && !Array.isArray(staticFiles)) {
      staticFiles = [staticFiles]
    }
  }

  uiFiles.forEach((file) => {
    if (file === uiDescFile) {
      return
    }

    file.type = resolveType(file, staticFiles)
    if (file.type === 'asset') {
      file.out = resolveOut(file, playbook.ui.outputDir)
    } else if (file.type === 'static') {
      file.out = resolveOut(file, '/')
    }

    uiCatalog.addFile(file)
  })

  return uiCatalog
}

function isRemote (bundle) {
  return bundle.startsWith('http://') || bundle.startsWith('https://')
}

function sha1 (string) {
  const shasum = crypto.createHash('sha1')
  shasum.update(string)
  return shasum.digest('hex')
}

function getFilesInStartPath (filesAndDirs, startPath) {
  return filesAndDirs
    .map((file) => {
      if (file.isDirectory()) {
        return null
      }
      const rootPath = '/' + file.path
      if (!rootPath.startsWith(startPath)) {
        return null
      }
      file.path = path.relative(startPath, rootPath)
      return file
    })
    .filter((file) => file != null)
}

function readUiDesc (files) {
  const uiDescFile = _.find(files, { path: 'ui.yml' })
  if (uiDescFile == null) {
    return {}
  }
  const uiDesc = yaml.safeLoad(uiDescFile.contents.toString())
  return { uiDesc, uiDescFile }
}

function resolveType (file, staticFiles) {
  const pathSegments = file.path.split('/').filter((a) => a !== '')
  if (pathSegments[0] === 'layouts') {
    return 'layout'
  } else if (pathSegments[0] === 'helpers') {
    return 'helper'
  } else if (pathSegments[0] === 'partials') {
    return 'partial'
  } else if (staticFiles != null && minimatchAll(file.path, staticFiles)) {
    return 'static'
  }
  return 'asset'
}

function resolveOut (file, outputDir = `/_`) {
  const dirname = path.join('/', outputDir, file.dirname)
  const basename = file.basename
  const outputPath = path.join(dirname, basename)
  return { dirname, basename, path: outputPath }
}
