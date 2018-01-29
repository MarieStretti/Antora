'use strict'

const File = require('vinyl')
const versionCompareDesc = require('@antora/content-classifier/lib/util/version-compare-desc')

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>'
const SITEMAPS_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const SITEMAP_STEM = 'sitemap'
const SITEMAP_PREFIX = 'sitemap-'

function mapSite (playbook, contentCatalog) {
  const siteUrl = playbook.site.url
  if (!siteUrl) return []
  const lastmodISO = new Date().toISOString()
  let sitemaps = contentCatalog.findBy({ family: 'page' }).reduce((accum, file) => {
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

  const sitemapIndexEntries = sitemaps.map(generateSitemapElement)

  const basename = SITEMAP_STEM + '.xml'
  const sitemapIndex = new File({
    path: basename,
    contents: Buffer.from(generateSitemapIndexDocument(sitemapIndexEntries)),
    out: { path: basename },
    pub: { url: '/' + basename },
  })

  return [sitemapIndex].concat(sitemaps)
}

function getSitemapForComponent (sitemaps, component, siteUrl) {
  if (sitemaps.has(component)) {
    return sitemaps.get(component)
  } else {
    const basename = `${SITEMAP_PREFIX}${component}.xml`
    const componentSitemap = new File({
      path: basename,
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
<loc>${sitemap.pub.absoluteUrl}</loc>
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
<loc>${entry.absoluteUrl}</loc>
<lastmod>${entry.lastmodISO}</lastmod>
</url>`
}

function generateSitemapDocument (entries) {
  return `${XML_DECL}
<urlset xmlns="${SITEMAPS_NS}">
${entries.join('\n')}
</urlset>`
}

module.exports = mapSite
