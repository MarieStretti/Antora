'use strict'

const fs = require('fs-extra')

// Remove README.md and restore hidden README.adoc
fs.unlink('README.md', (unlinkErr) => {
  if (unlinkErr) throw unlinkErr
})
fs.move('.README.adoc', 'README.adoc', (moveErr) => {
  if (moveErr) throw moveErr
})
