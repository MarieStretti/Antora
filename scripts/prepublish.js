'use strict'

const fs = require('fs')
const { promisify } = require('util')
const README_SRC = 'README.adoc'
const README_HIDDEN = '.' + README_SRC
const README_DEST = 'README.md'

function writeMarkdown (asciidoc) {
  const markdown = asciidoc
    .replace(/^=+(?= \w)/gm, (m) => '#'.repeat(m.length))
    .replace(new RegExp('(https?:[^\\[]+)\\[(|.*?[^\\\\])\\]', 'g'), '[$2]($1)')
  return promisify(fs.writeFile)(README_DEST, markdown)
}

/**
 * Transforms the AsciiDoc README (README.adoc) in the working directory into
 * Markdown format (README.md) and hides the AsciiDoc README (.README.adoc).
 */
;(async () => {
  const readmeSrc = await promisify(fs.stat)(README_SRC).then((stat) => (stat.isFile() ? README_SRC : README_HIDDEN))
  const writeP = promisify(fs.readFile)(readmeSrc, 'utf8').then((asciidoc) => writeMarkdown(asciidoc))
  const renameP = readmeSrc === README_SRC ? promisify(fs.rename)(README_SRC, README_HIDDEN) : Promise.resolve()
  await Promise.all([writeP, renameP])
})()
