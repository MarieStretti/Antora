// require/define our software components
const PlaybookBuilder = require('./packages/playbook/builder')
// ...

// run the pipeline
const playbook = PlaybookBuilder.load(process.argv, process.env)
// (Boolean) PlaybookBuilder.validateSpecFile(path)
// (Playbook) PlaybookBuilder.loadSpecFile(path)

// test
console.log(playbook.site.title)
