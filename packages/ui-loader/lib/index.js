'use strict'

const buffer = require('gulp-buffer')
const crypto = require('crypto')
const download = require('download')
const fs = require('fs-extra')
const map = require('map-stream')
const minimatchAll = require('minimatch-all')
const path = require('path')
const streamToArray = require('stream-to-array')
const UiCatalog = require('./ui-catalog')
const yaml = require('js-yaml')
const zip = require('gulp-vinyl-zip')

const { UI_CACHE_PATH, UI_CONFIG_FILENAME } = require('./constants')

module.exports = async (playbook) => {
  const { bundle, startPath, outputDir } = playbook.ui
  let bundlePath
  if (isUrl(bundle)) {
    bundlePath = getCachePath(sha1(bundle) + '.zip')
    if (!fs.pathExistsSync(bundlePath)) {
      fs.ensureDirSync(path.dirname(bundlePath))
      fs.writeFileSync(bundlePath, await download(bundle))
    }
  } else {
    bundlePath = path.resolve(bundle)
  }

  const files = await streamToArray(
    zip
      .src(bundlePath)
      .pipe(selectFilesStartingFrom(startPath))
      .pipe(buffer())
  )

  const config = loadConfig(files, outputDir)

  return files.reduce((catalog, file) => {
    catalog.addFile(classifyFile(file, config))
    return catalog
  }, new UiCatalog())
}

function isUrl (string) {
  return string.startsWith('http://') || string.startsWith('https://')
}

function sha1 (string) {
  const shasum = crypto.createHash('sha1')
  shasum.update(string)
  return shasum.digest('hex')
}

function getCachePath (relative) {
  return path.resolve(UI_CACHE_PATH, relative)
}

function selectFilesStartingFrom (startPath) {
  if (!startPath || (startPath = path.join('/', startPath + '/')) === '/') {
    return map((file, next) => {
      file.isNull() ? next() : next(null, file)
    })
  } else {
    startPath = startPath.slice(1)
    const startPathOffset = startPath.length
    return map((file, next) => {
      if (!file.isNull()) {
        const filePath = file.path
        if (filePath.length > startPathOffset && filePath.startsWith(startPath)) {
          file.path = filePath.slice(startPathOffset)
          next(null, file)
          return
        }
      }
      next()
    })
  }
}

function loadConfig (files, outputDir) {
  const configFileIdx = files.findIndex((file) => file.path === UI_CONFIG_FILENAME)
  if (configFileIdx !== -1) {
    const configFile = files[configFileIdx]
    files.splice(configFileIdx, 1)
    const config = yaml.safeLoad(configFile.contents.toString())
    config.outputDir = outputDir
    const staticFiles = config.staticFiles
    if (staticFiles) {
      if (!Array.isArray(staticFiles)) {
        config.staticFiles = [staticFiles]
      } else if (staticFiles.length === 0) {
        delete config.staticFiles
      }
    }
    return config
  } else {
    return { outputDir }
  }
}

function classifyFile (file, config) {
  Object.defineProperty(file, 'relative', {
    get: function () {
      return this.path
    },
  })
  if (config.staticFiles && isStaticFile(file, config.staticFiles)) {
    file.type = 'static'
    file.out = resolveOut(file, '')
  } else {
    file.type = resolveType(file)
    if (file.type === 'asset') {
      file.out = resolveOut(file, config.outputDir)
    }
  }
  return file
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

function resolveOut (file, outputDir = '_') {
  let dirname = path.join(outputDir, file.dirname)
  if (dirname.startsWith('/')) dirname = dirname.slice(1)
  const basename = file.basename
  return { dirname, basename, path: path.join(dirname, basename) }
}
