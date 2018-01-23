'use strict'

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
      .pipe(adapter(dest))
      .on('error', (err) => reject(err))
      .on('end', () => resolve())
  )
}

module.exports = vinylPublish
