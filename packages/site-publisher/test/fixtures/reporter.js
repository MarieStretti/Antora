'use strict'

const fs = require('fs')

module.exports = async (destConfig, filesStream, playbook) => {
  const files = []
  let file
  while ((file = filesStream.read())) files.push(file)
  fs.writeFileSync(destConfig.path, `published ${files.length} files for ${playbook.site.title}`)
}
