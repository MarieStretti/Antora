// require/define our software components
const buildPlaybook = require('../packages/playbook/lib/playbook-builder')
// ...

// run the pipeline
const playbook = buildPlaybook()

// test
console.log(playbook)
