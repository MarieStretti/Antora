'use strict'

const computeRelativeUrlPath = require('@antora/asciidoc-loader/lib/util/compute-relative-url-path')
const File = require('vinyl')
const { URL } = require('url')

const ALL_SPACES_RX = / /g

/**
 * Produces redirects (HTTP redirections) for registered page aliases.
 *
 * Iterates over files in the alias family from the content catalog and creates artifacts that
 * handle redirects from the URL of each alias to the target URL. The artifact that is created
 * depends on the redirect facility in use. If the redirect facility is static (the default), this
 * function populates the contents of the alias file with an HTML redirect page (i.e., bounce page).
 * If the redirect facility is nginx, this function creates and returns an nginx configuration file
 * that contains rewrite rules for each alias. If the redirect facility is disabled, this function
 * unpublishes the alias files by removing the out property on each alias file.
 *
 * @memberof redirect-producer
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {Object} playbook.site - Site-related configuration data.
 * @param {String} playbook.site.url - The base URL of the site.
 * @param {String} playbook.urls - URL-related configuration data.
 * @param {String} playbook.urls.redirectFacility - The redirect facility for
 *   which redirect configuration is being produced.
 * @param {ContentCatalog} contentCatalog - The content catalog that provides
 *   access to the virtual content files (i.e., pages) in the site.
 * @returns {Array<File>} An array of File objects that contain rewrite configuration for the web server.
 */
function produceRedirects (playbook, contentCatalog) {
  const aliases = contentCatalog.findBy({ family: 'alias' })
  if (!aliases.length) return []
  let siteUrl = playbook.site.url
  if (siteUrl) {
    if (siteUrl === '/') siteUrl = ''
    else if (siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
  }
  switch (playbook.urls.redirectFacility) {
    case 'static':
      return populateStaticRedirectFiles(aliases, siteUrl)
    case 'netlify':
      return createNetlifyRedirects(
        aliases,
        extractUrlPath(siteUrl),
        (playbook.urls.htmlExtensionStyle || 'default') === 'default'
      )
    case 'nginx':
      return createNginxRewriteConf(aliases, extractUrlPath(siteUrl))
    default:
      return unpublish(aliases)
  }
}

function extractUrlPath (url) {
  if (url) {
    if (url.charAt() === '/') return url
    const urlPath = new URL(url).pathname
    return urlPath === '/' ? '' : urlPath
  }
  return ''
}

function populateStaticRedirectFiles (files, siteUrl) {
  files.forEach((file) => {
    file.contents = createStaticRedirectContents(file, siteUrl)
    file.mediaType = 'text/html'
  })
  return []
}

function createNetlifyRedirects (files, urlPath, includeDirectoryRedirects = false) {
  const rules = files.reduce((accum, file) => {
    delete file.out
    const from = urlPath + file.pub.url.replace(ALL_SPACES_RX, '%20')
    const to = urlPath + file.rel.pub.url.replace(ALL_SPACES_RX, '%20')
    accum.push(`${from} ${to} 301`)
    if (includeDirectoryRedirects && from.endsWith('/index.html')) accum.push(`${from.slice(0, -10)} ${to} 301`)
    return accum
  }, [])
  const redirectsFile = new File({
    contents: Buffer.from(rules.join('\n')),
    out: { path: '_redirects' },
  })
  return [redirectsFile]
}

function createNginxRewriteConf (files, urlPath) {
  const rules = files.map((file) => {
    delete file.out
    let from = file.pub.url
    from = ~from.indexOf(' ') ? `'${urlPath}${from}'` : urlPath + from
    let to = file.rel.pub.url
    to = ~to.indexOf(' ') ? `'${urlPath}${to}'` : urlPath + to
    return `location = ${from} { return 301 ${to}; }`
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
  const canonicalUrl = siteUrl && siteUrl.charAt() !== '/' ? siteUrl + targetUrl : undefined
  const canonicalLink = canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}">\n` : ''
  return Buffer.from(`<!DOCTYPE html>
<meta charset="utf-8">
${canonicalLink}<script>location="${relativeUrl}"</script>
<meta http-equiv="refresh" content="0; url=${relativeUrl}">
<meta name="robots" content="noindex">
<title>Redirect Notice</title>
<h1>Redirect Notice</h1>
<p>The page you requested has been relocated to <a href="${relativeUrl}">${canonicalUrl || relativeUrl}</a>.</p>`)
}

module.exports = produceRedirects
