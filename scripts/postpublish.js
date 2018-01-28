'use strict'

const fs = require('fs')
const { promisify } = require('util')
const README_SRC = 'README.adoc'
const README_HIDDEN = '.' + README_SRC
const README_DEST = 'README.md'

/**
 * Removes the generated Markdown README (README.md) in the working directory
 * and restores the hidden AsciiDoc README (.README.adoc -> README.adoc).
 */
;(async () => {
  const nukeP = promisify(fs.stat)(README_DEST).then((stat) => {
    if (stat.isFile()) return promisify(fs.unlink)(README_DEST)
  })
  const restoreP = promisify(fs.stat)(README_HIDDEN).then((stat) => {
    if (stat.isFile()) return promisify(fs.rename)(README_HIDDEN, README_SRC)
  })
  await Promise.all([nukeP, restoreP])
})()
