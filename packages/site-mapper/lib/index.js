'use strict'

/**
 * Site Mapper component for Antora
 *
 * Generates sitemap files for the site. These files, which are intended to be
 * read by crawlers, provide a list of all published pages by URL. The sitemap
 * entries are partitioned by component into sitemap index files, which are
 * then referenced by the main sitemap file.
 *
 * @namespace site-mapper
 */
module.exports = require('./generate-sitemaps')
