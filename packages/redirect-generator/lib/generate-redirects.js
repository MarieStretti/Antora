'use strict'

const computeRelativeUrlPath = require('@antora/asciidoc-loader/lib/util/compute-relative-url-path')
const File = require('vinyl')
const url = require('url')

function generateRedirects (playbook, contentCatalog) {
  const aliases = contentCatalog.findBy({ family: 'alias' })
  if (!aliases.length) return []
  let siteUrl = playbook.site.url
  switch (playbook.urls.redirectFacility) {
    case 'static':
      if (siteUrl && siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
      return populateStaticRedirectFiles(aliases, siteUrl)
    case 'nginx':
      let urlContext
      if (siteUrl && (urlContext = url.parse(siteUrl).pathname) === '/') urlContext = undefined
      return generateNginxRedirects(aliases, urlContext)
    default:
      return unpublish(aliases)
  }
}

function populateStaticRedirectFiles (files, siteUrl) {
  files.forEach((file) => {
    file.contents = createStaticRedirectContents(file, siteUrl)
    file.mediaType = 'text/html'
  })
  return []
}

function generateNginxRedirects (files, urlContext = '') {
  const rules = files.map((file) => {
    delete file.out
    return `location = ${urlContext}${file.pub.url} { return 301 ${urlContext}${file.rel.pub.url}; }`
  })
  const rewriteConfigFile = new File({
    contents: Buffer.from(rules.join('\n')),
    out: { path: '.etc/nginx/rewrite.conf' },
  })
  return [rewriteConfigFile]
}

function unpublish (files) {
  files.forEach((file) => delete file.out)
  return []
}

function createStaticRedirectContents (file, siteUrl) {
  const targetUrl = file.rel.pub.url
  const relativeUrl = computeRelativeUrlPath(file.pub.url, targetUrl)
  const canonicalUrl = siteUrl ? siteUrl + targetUrl : undefined
  const canonicalLink = siteUrl ? `\n<link rel="canonical" href="${canonicalUrl}">` : ''
  return Buffer.from(`<!DOCTYPE html>
<meta charset="utf-8">${canonicalLink}
<script>location="${relativeUrl}"</script>
<meta http-equiv="refresh" content="0; url=${relativeUrl}">
<meta name="robots" content="noindex">
<title>Redirect Notice</title>
<h1>Redirect Notice</h1>
<p>The page you requested has been relocated to <a href="${relativeUrl}">${canonicalUrl || relativeUrl}</a>.</p>`)
}

module.exports = generateRedirects
