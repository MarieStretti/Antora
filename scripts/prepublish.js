'use strict'

const fs = require('fs')

// Transform README.adoc into README.md and hide README.adoc
fs.readFile('README.adoc', 'utf8', (readErr, asciidoc) => {
  if (readErr) throw readErr
  fs.rename('README.adoc', '.README.adoc', (renameErr) => {
    if (renameErr) throw renameErr
  })
  const markdown = asciidoc
    .replace(/^=+(?= \w)/gm, (m) => '#'.repeat(m.length))
    .replace(new RegExp('(https?:[^\\[]+)\\[(|.*?[^\\\\])\\]', 'g'), '[$2]($1)')
  fs.writeFile('README.md', markdown, (writeErr) => {
    if (writeErr) throw writeErr
  })
})
