'use strict'

/**
 * Removes the generated Markdown README (README.md) in the working directory
 * and restores the hidden AsciiDoc README (.README.adoc -> README.adoc).
 */

const fs = require('fs')
const { promisify } = require('util')

const README_SRC = 'README.adoc'
const README_HIDDEN = '.' + README_SRC
const README_DEST = 'README.md'

;(async () => {
  const nukeP = promisify(fs.exists)(README_DEST).then((exists) => {
    if (exists) return promisify(fs.unlink)(README_DEST)
  })
  const restoreP = promisify(fs.exists)(README_HIDDEN).then((exists) => {
    if (exists) return promisify(fs.rename)(README_HIDDEN, README_SRC)
  })
  await Promise.all([nukeP, restoreP])
})()
