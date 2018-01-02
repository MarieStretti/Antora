let start = +new Date()
const generateSite = require('@antora/pipeline-default')
console.log('init in ' + (+new Date() - start) + 'ms')
;(async () => {
  start = +new Date()
  await generateSite(process.argv.slice(2), process.env, 'build/site')
  console.log('done in ' + (+new Date() - start) + 'ms')
})()
