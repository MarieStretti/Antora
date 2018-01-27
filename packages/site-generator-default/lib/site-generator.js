'use strict'

const aggregateContent = require('@antora/content-aggregator')
const buildNavigation = require('@antora/navigation-builder')
const buildPlaybook = require('@antora/playbook-builder')
const classifyContent = require('@antora/content-classifier')
const convertDocument = require('@antora/document-converter')
const createPageComposer = require('@antora/page-composer')
const loadUi = require('@antora/ui-loader')
const publishSite = require('@antora/site-publisher')

process.on('unhandledRejection', (reason) => {
  console.error(`An unexpected error occurred: Unhandled promise rejection: ${reason.stack}`)
  process.exitCode = 1
})

async function generateSite (args, env) {
  const playbook = buildPlaybook(args, env)

  let uiCatalogPromise
  const contentCatalog = await (async () => {
    const contentAggregatePromise = aggregateContent(playbook)
    uiCatalogPromise = loadUi(playbook)
    return classifyContent(playbook, await contentAggregatePromise)
  })()

  const pages = contentCatalog.findBy({ family: 'page' })

  await Promise.all(pages.map(async (page) => convertDocument(page, {}, contentCatalog)))

  const navigationCatalog = buildNavigation(contentCatalog)
  const uiCatalog = await uiCatalogPromise

  // TODO we could do this in same stream as convertDocument; but then we'd have an ordering problem
  ;((composePage) => {
    pages.forEach((page) => composePage(page, contentCatalog, navigationCatalog))
  })(createPageComposer(playbook, contentCatalog, uiCatalog))

  return publishSite(playbook, [contentCatalog, uiCatalog])
}

module.exports = generateSite
