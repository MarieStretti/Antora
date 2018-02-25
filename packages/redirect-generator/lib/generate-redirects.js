'use strict'

const computeRelativeUrlPath = require('@antora/asciidoc-loader/lib/util/compute-relative-url-path')
const File = require('vinyl')
const url = require('url')

function generateRedirects (playbook, contentCatalog) {
  const aliases = contentCatalog.findBy({ family: 'alias' })
  if (!aliases.length) return []
  let siteUrl = playbook.site.url
  switch (playbook.urls.redirectStrategy) {
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
  const relUrl = file.rel.pub.url
  const redirectUrl = computeRelativeUrlPath(file.pub.url, relUrl)
  const qualifiedRedirectUrl = siteUrl ? siteUrl + relUrl : relUrl.substr(1)
  const canonicalLink = siteUrl ? `\n<link rel="canonical" href="${qualifiedRedirectUrl}">` : ''
  return Buffer.from(`<!DOCTYPE html>
<meta charset="utf-8">${canonicalLink}
<script>location="${redirectUrl}"</script>
<meta http-equiv="refresh" content="0; url=${redirectUrl}">
<meta name="robots" content="noindex">
<title>Redirect Notice</title>
<h1>Redirect Notice</h1>
<p>The page you requested has been relocated to <a href="${redirectUrl}">${qualifiedRedirectUrl}</a>.</p>`)
}

module.exports = generateRedirects
