'use strict'

const aggregateContent = require('@antora/content-aggregator')
const buildNavigation = require('@antora/navigation-builder')
const buildPlaybook = require('@antora/playbook-builder')
const classifyContent = require('@antora/content-classifier')
const convertDocuments = require('@antora/document-converter')
const createPageComposer = require('@antora/page-composer')
const generateSitemaps = require('@antora/site-mapper')
const loadUi = require('@antora/ui-loader')
const publishSite = require('@antora/site-publisher')
const { resolveConfig: resolveAsciiDocConfig } = require('@antora/asciidoc-loader')

const resolvePage = require('@antora/asciidoc-loader/lib/xref/resolve-page')

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

  const startPage = playbook.site.startPage
  if (startPage) registerSiteStartPage(startPage, contentCatalog)

  const sitemapFiles = generateSitemaps(playbook, contentCatalog)
  const sitemapCatalog = { getFiles: () => sitemapFiles }

  return publishSite(playbook, [contentCatalog, uiCatalog, sitemapCatalog])
}

// FIXME this functionality belongs in the page-router component
// QUESTION should we use title of target page?
function registerSiteStartPage (startPageSpec, contentCatalog) {
  const startPage = resolvePage(startPageSpec, contentCatalog)
  if (!startPage) throw new Error('Start page for site could not be resolved: ' + startPageSpec)
  const startPageSrc = startPage.src
  const redirectUrl = startPage.pub.url.substr(1)
  const indexPage = new startPage.constructor({
    contents: Buffer.from(`<!DOCTYPE html>
<meta charset="utf-8">
<link rel="canonical" href="${redirectUrl}">
<script>location="${redirectUrl}"</script>
<meta http-equiv="refresh" content="0; url=${redirectUrl}">
<meta name="robots" content="noindex">
<title>Redirect to Start Page</title>
<p><a href="${redirectUrl}">Continue to start page&hellip;</a></p>`),
    out: { path: 'index.html' },
    src: {
      component: startPageSrc.component,
      version: startPageSrc.version,
      module: startPageSrc.module,
      relative: startPageSrc.relative,
      family: 'redirect',
    },
  })
  contentCatalog.addFile(indexPage)
}

module.exports = generateSite
