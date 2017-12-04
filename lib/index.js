// require/define our software components
const buildPlaybook = require('../packages/playbook-builder/lib/index')
// ...

// run the pipeline
const playbook = buildPlaybook(process.argv.slice(2), process.env)

// test
console.log(playbook)
