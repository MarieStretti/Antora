'use strict'

const { obj: map } = require('through2')
const Vinyl = require('vinyl')

/**
 * Pipes the files stream to the specified adapter and returns a Promise.
 *
 * Wraps the specified files stream in a Promise, pipes the stream to the
 * specified Vinyl dest adapter, and returns the Promise.
 *
 * @memberof site-publisher
 *
 * @param {Object} adapter - A Vinyl dest adapter.
 * @param {Object} dest - A data object containing information for the adapter
 *   about how and where to publish the files.
 * @param {Readable} files - A Readable of virtual files to publish.
 * @returns Promise.
 */
async function vinylPublish (adapter, dest, files) {
  return new Promise((resolve, reject) =>
    files
      .pipe(map((file, _, next) => next(null, toOutputFile(file))))
      .pipe(adapter(dest))
      .on('error', (err) => reject(err))
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
