'use strict'

const { obj: map } = require('through2')
const Vinyl = require('vinyl')

async function vinylPublish (adapter, dest, files) {
  return new Promise((resolve, reject) =>
    files
      .pipe(map((file, _, next) => next(null, toOutputFile(file))))
      .pipe(adapter(dest))
      .on('error', (e) => reject(e))
      .on('end', () => resolve())
  )
}

class File extends Vinyl {
  get relative () {
    return this.path
  }
}

function toOutputFile (file) {
  return new File({ contents: file.contents, path: file.out.path, stat: file.stat })
}

module.exports = vinylPublish
