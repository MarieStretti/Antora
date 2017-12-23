'use strict'

const _ = require('lodash')
const buffer = require('gulp-buffer')
const crypto = require('crypto')
const download = require('download')
const fs = require('fs-extra')
const minimatchAll = require('minimatch-all')
const path = require('path')
const streamToArray = require('stream-to-array')
const yaml = require('js-yaml')
const zip = require('gulp-vinyl-zip')

const { UI_CACHE_PATH } = require('./constants')

const $files = Symbol('files')
const $generateId = Symbol('generateId')

class UiCatalog {
  constructor () {
    this[$files] = {}
  }

  getFiles () {
    return Object.values(this[$files])
  }

  addFile (file) {
    const id = this[$generateId](file)
    if (id in this[$files]) {
      throw new Error('Duplicate file')
    }
    this[$files][id] = file
  }

  findByType (type) {
    return _.filter(this[$files], { type })
  }

  [$generateId] (file) {
    return [file.type, ...file.path.split('/')]
  }
}

module.exports = async (playbook) => {
  const uiCatalog = new UiCatalog()

  let zipPath
  if (isRemote(playbook.ui.bundle)) {
    const cacheAbsDir = getCacheDir()
    zipPath = path.join(cacheAbsDir, sha1(playbook.ui.bundle) + '.zip')
    if (!fs.pathExistsSync(zipPath)) {
      fs.ensureDirSync(cacheAbsDir)
      const bundle = await download(playbook.ui.bundle)
      fs.writeFileSync(zipPath, bundle)
    }
  } else {
    zipPath = path.join(process.cwd(), playbook.ui.bundle)
  }

  const zipFilesAndDirsStream = zip.src(zipPath).pipe(buffer())

  const zipFilesAndDirs = await streamToArray(zipFilesAndDirsStream)
  const uiFiles = getFilesFromStartPath(zipFilesAndDirs, playbook.ui.startPath)
  const { uiDesc } = readUiDesc(uiFiles)

  let staticFiles
  if (uiDesc != null) {
    if ((staticFiles = uiDesc.staticFiles) != null && !Array.isArray(staticFiles)) {
      staticFiles = [staticFiles]
    }
  }

  uiFiles.forEach((file) => {
    if (staticFiles != null && isStaticFile(file, staticFiles)) {
      file.type = 'static'
      file.out = resolveOut(file, '/')
    } else {
      file.type = resolveType(file)
      if (file.type === 'asset') {
        file.out = resolveOut(file, playbook.ui.outputDir)
      }
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

function getCacheDir () {
  return path.resolve(UI_CACHE_PATH)
}

function getFilesFromStartPath (filesAndDirs, startPath) {
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
  const uiDescFileIndex = _.findIndex(files, { path: 'ui.yml' })
  if (uiDescFileIndex === -1) {
    return {}
  }
  const [uiDescFile] = files.splice(uiDescFileIndex, 1)
  const uiDesc = yaml.safeLoad(uiDescFile.contents.toString())
  return { uiDesc, uiDescFile }
}

function isStaticFile (file, staticFiles) {
  return minimatchAll(file.path, staticFiles)
}

function resolveType (file) {
  const firstPathSegment = file.path.split('/', 1)[0]
  if (firstPathSegment === 'layouts') {
    return 'layout'
  } else if (firstPathSegment === 'helpers') {
    return 'helper'
  } else if (firstPathSegment === 'partials') {
    return 'partial'
  } else {
    return 'asset'
  }
}

function resolveOut (file, outputDir = '/_') {
  const dirname = path.join('/', outputDir, file.dirname)
  const basename = file.basename
  const outputPath = path.join(dirname, basename)
  return { dirname, basename, path: outputPath }
}
