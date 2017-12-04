// require/define our software components
const buildPlaybook = require('../packages/playbook-builder/lib/index')
// ...

// run the pipeline
const playbook = buildPlaybook()

// test
console.log(playbook)
