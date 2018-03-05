'use strict'

const aggregateContent = require('@antora/content-aggregator')
const buildNavigation = require('@antora/navigation-builder')
const buildPlaybook = require('@antora/playbook-builder')
const classifyContent = require('@antora/content-classifier')
const convertDocuments = require('@antora/document-converter')
const createPageComposer = require('@antora/page-composer')
const generateSitemaps = require('@antora/site-mapper')
const loadUi = require('@antora/ui-loader')
const produceRedirects = require('@antora/redirect-producer')
const publishSite = require('@antora/site-publisher')
const { resolveConfig: resolveAsciiDocConfig } = require('@antora/asciidoc-loader')

// QUESTION should we move this listener to the cli?
process.on('unhandledRejection', (reason) => {
  console.error(`An unexpected error occurred: Unhandled promise rejection: ${reason.stack}`)
  process.exitCode = 1
})

async function generateSite (args, env) {
  const playbook = buildPlaybook(args, env)
  const [contentCatalog, uiCatalog] = await Promise.all([
    aggregateContent(playbook).then((contentAggregate) => classifyContent(playbook, contentAggregate)),
    loadUi(playbook),
  ])
  const asciidocConfig = resolveAsciiDocConfig(playbook)
  const pages = convertDocuments(contentCatalog, asciidocConfig)
  const navigationCatalog = buildNavigation(contentCatalog, asciidocConfig)
  ;((composePage) => {
    pages.forEach((page) => composePage(page, contentCatalog, navigationCatalog))
  })(createPageComposer(playbook, contentCatalog, uiCatalog))
  const siteFiles = generateSitemaps(playbook, contentCatalog).concat(produceRedirects(playbook, contentCatalog))
  const siteCatalog = { getFiles: () => siteFiles }
  return publishSite(playbook, [contentCatalog, uiCatalog, siteCatalog])
}

module.exports = generateSite
