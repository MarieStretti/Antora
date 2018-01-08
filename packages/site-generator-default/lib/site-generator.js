'use strict'

const map = require('through2').obj
const streamify = require('streamify-array')
const vfs = require('vinyl-fs')

const buildPlaybook = require('@antora/playbook-builder')
const aggregateContent = require('@antora/content-aggregator')
const loadUi = require('@antora/ui-loader')
const classifyContent = require('@antora/content-classifier')
const convertDocument = require('@antora/document-converter')
const buildNavigation = require('@antora/navigation-builder')
const createPageComposer = require('@antora/page-composer')

process.on('unhandledRejection', (reason) => {
  console.error(`An unexpected error occurred: Unhandled promise rejection: ${reason.stack}`)
  process.exitCode = 1
})

async function generateSite (args, env, outputDir) {
  const playbook = buildPlaybook(args, env)
  let uiCatalogPromise
  const contentCatalog = await (async () => {
    const contentAggregatePromise = aggregateContent(playbook)
    uiCatalogPromise = loadUi(playbook)
    return classifyContent(playbook, await contentAggregatePromise)
  })()

  // QUESTION should we require pages in case pages get vetoed?
  const pages = contentCatalog.findBy({ family: 'page' })

  await Promise.all(pages.map(async (page) => convertDocument(page, {}, contentCatalog)))

  const navigationCatalog = buildNavigation(contentCatalog)
  const uiCatalog = await uiCatalogPromise

  // TODO we could do this in same stream as convertDocument; but then we'd have an ordering problem
  pages.reduce((composePage, page) => {
    composePage(page, contentCatalog, navigationCatalog)
    return composePage
  }, createPageComposer(playbook, contentCatalog, uiCatalog))

  // TODO this should be handled by publishSite (or publish or publishFiles)
  // FIXME we need a way to get publishable files (just files with out property?); getPublishableFiles()?
  // also perhaps getFileStream()
  return new Promise((resolve, reject) =>
    streamify(
      contentCatalog
        .getFiles()
        .concat(uiCatalog.getFiles())
        .filter((file) => file.out)
    )
      .pipe(
        map((file, enc, next) => {
          file.path = file.out.path
          next(null, file)
        })
      )
      .pipe(vfs.dest(outputDir))
      .on('error', (e) => reject(e))
      .on('end', () => resolve())
  )
}

module.exports = generateSite
