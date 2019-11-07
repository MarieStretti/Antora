'use strict'

const convertDocument = require('./convert-document')

/**
 * Converts the contents of AsciiDoc files in the content catalog to embeddable HTML.
 *
 * Finds all AsciiDoc files in the page family in the content catalog and converts the contents of
 * those files to embeddable HTML by delegating to the convertDocument function. The function then
 * returns all the files in the page family.  All the files returned from this function are expected
 * be composed (i.e., wrapped in an HTML layout) by the page composer.
 *
 * @memberof document-converter
 *
 * @param {ContentCatalog} contentCatalog - The catalog of all virtual content files in the site.
 * @param {Object} [siteAsciiDocConfig={}] - Site-wide AsciiDoc processor configuration options.
 *
 * @returns {Array<File>} The virtual files in the page family taken from the content catalog.
 */
function convertDocuments (contentCatalog, siteAsciiDocConfig = {}) {
  const asciidocConfigs = new Map(
    contentCatalog.getComponents().reduce((accum, { name, versions }) => {
      return accum.concat(versions.map(({ version, asciidocConfig }) => [name + '@' + version, asciidocConfig]))
    }, [])
  )
  return contentCatalog
    .findBy({ family: 'page' })
    .filter((page) => page.out)
    .map((page) => {
      if (page.mediaType === 'text/asciidoc') {
        const asciidocConfig = asciidocConfigs.get(page.src.component + '@' + page.src.version) || siteAsciiDocConfig
        return convertDocument(page, contentCatalog, asciidocConfig)
      }
      return page
    })
    .map((page) => delete page.src.contents && page)
}

module.exports = convertDocuments
module.exports.convertDocument = convertDocument
