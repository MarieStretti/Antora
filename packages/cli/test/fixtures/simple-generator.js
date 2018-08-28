'use strict'

const buildPlaybook = require('@antora/playbook-builder')
const publishSite = require('@antora/site-publisher')

async function generateSite (args, env) {
  const playbook = buildPlaybook(args, env)
  const siteCatalog = { getFiles: () => [create418Page()] }
  return publishSite(playbook, [siteCatalog])
}

function create418Page () {
  return {
    title: 'I\'m a teapot',
    contents: Buffer.from('<html><h1>Teapot</h1><p>I\'m a teapot</p></html>'),
    mediaType: 'text/html',
    src: { stem: '418' },
    out: { path: '418.html' },
    pub: { url: '/418.html', rootPath: '' },
  }
}

module.exports = generateSite
