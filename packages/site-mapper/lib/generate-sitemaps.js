'use strict'

const File = require('vinyl')
const versionCompareDesc = require('@antora/content-classifier/lib/util/version-compare-desc')

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>'
const SITEMAPS_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const SITEMAP_STEM = 'sitemap'
const SITEMAP_PREFIX = 'sitemap-'

/**
 * Generates sitemap files from the pages in the site.
 *
 * Iterates over the files from the page family in the content catalog and
 * generates sitemap files. If there's only one component, all the entries are
 * added to a sitemap.xml file that gets published to the root of the site. If
 * there's more than one component, the sitemaps are partitioned into separate
 * files by component (e.g., sitemap-component-name.xml). The URL of those
 * component sitemaps are listed in the sitemap.xml index file that gets
 * published to the root of the site.
 *
 * The entries are listed in alphabetical order by URL. URLs with newer
 * versions are listed before URLs of older versions according to the semantic
 * versioning-based sorting algorithm used in Antora.
 *
 * The sitemaps are only generated if a url for the site has been defined to
 * the site.url property in the playbook.
 *
 * @memberof site-mapper
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.site - Site-related configuration data.
 * @param {String} playbook.site.url - The base URL of the site.
 * @param {ContentCatalog} contentCatalog - The content catalog that provides
 *   access to the virtual content files (i.e., pages) in the site.
 * @returns {Array<File>} An array of File objects that represent the sitemaps.
 */
function generateSitemaps (playbook, contentCatalog) {
  let siteUrl = playbook.site.url
  if (!siteUrl) return []
  if (siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
  const pages = contentCatalog.findBy({ family: 'page' })
  if (!pages.length) return []
  const lastmodISO = new Date().toISOString()
  let sitemaps = pages.reduce((accum, file) => {
    const componentSitemap = getSitemapForComponent(accum, file.src.component, siteUrl)
    const version = file.src.version
    componentSitemap.entries.push({
      url: file.pub.url,
      absoluteUrl: file.pub.absoluteUrl,
      version,
      lastmodISO,
    })
    componentSitemap.versions.add(version)
    return accum
  }, new Map())

  sitemaps = Array.from(sitemaps.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((component) => {
      const sitemap = sitemaps.get(component)
      let sitemapEntries = sitemap.entries
      delete sitemap.entries
      sitemapEntries.sort((a, b) => a.url.localeCompare(b.url))
      if (sitemap.versions.size > 1) sitemapEntries.sort((a, b) => versionCompareDesc(a.version, b.version))
      delete sitemap.versions
      sitemapEntries = sitemapEntries.map(generateUrlElement)
      sitemap.contents = Buffer.from(generateSitemapDocument(sitemapEntries))
      return sitemap
    })

  let sitemapIndex
  if (sitemaps.length > 1) {
    const sitemapIndexEntries = sitemaps.map(generateSitemapElement)
    sitemapIndex = new File({ contents: Buffer.from(generateSitemapIndexDocument(sitemapIndexEntries)) })
    sitemaps.unshift(sitemapIndex)
  } else {
    sitemapIndex = sitemaps[0]
  }
  const basename = SITEMAP_STEM + '.xml'
  sitemapIndex.out = { path: basename }
  sitemapIndex.pub = {
    absoluteUrl: siteUrl + '/' + basename,
    url: '/' + basename,
  }
  return sitemaps
}

function getSitemapForComponent (sitemaps, component, siteUrl) {
  if (sitemaps.has(component)) {
    return sitemaps.get(component)
  } else {
    const basename = `${SITEMAP_PREFIX}${component}.xml`
    const componentSitemap = new File({
      entries: [],
      out: { path: basename },
      pub: {
        absoluteUrl: siteUrl + '/' + basename,
        url: '/' + basename,
      },
      versions: new Set(),
    })
    sitemaps.set(component, componentSitemap)
    return componentSitemap
  }
}

function generateSitemapElement (sitemap) {
  return `<sitemap>
<loc>${escapeHtml(sitemap.pub.absoluteUrl)}</loc>
</sitemap>`
}

function generateSitemapIndexDocument (entries) {
  return `${XML_DECL}
<sitemapindex xmlns="${SITEMAPS_NS}">
${entries.join('\n')}
</sitemapindex>`
}

function generateUrlElement (entry) {
  return `<url>
<loc>${escapeHtml(entry.absoluteUrl)}</loc>
<lastmod>${entry.lastmodISO}</lastmod>
</url>`
}

function generateSitemapDocument (entries) {
  return `${XML_DECL}
<urlset xmlns="${SITEMAPS_NS}">
${entries.join('\n')}
</urlset>`
}

function escapeHtml (str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

module.exports = generateSitemaps
