module.exports = {
  playbook: {
    doc: 'Location of the playbook file.',
    format: String,
    default: 'site.yml',
    env: 'PLAYBOOK',
    arg: 'playbook',
  },
  site: {
    url: {
      doc: 'The base URL of the published site (optional). Should not include a trailing slash.',
      format: String,
      default: undefined,
      env: 'URL',
      arg: 'url',
    },
    title: {
      doc: 'The title of the site (optional).',
      format: String,
      default: undefined,
      arg: 'title',
    },
    root: {
      doc: 'The name of the component to use as the root of the site (optional).',
      format: String,
      default: undefined,
    },
    aspect: {
      doc: 'The name of the aspect navigation to make available on every page in the site.',
      format: String,
      default: undefined,
    },
    nav: {
      doc: 'The list of descriptors which define the aspect navigation domains.',
      format: Array,
      default: undefined,
    },
    keys: {
      google_analytics: {
        doc: 'The Google Analytics account key.',
        format: String,
        default: undefined,
        arg: 'google-analytics-key',
      },
      swiftype: {
        doc: 'The key to activate the Swiftype widget.',
        format: String,
        default: undefined,
        arg: 'swiftype-key',
      },
    },
  },
  content: {
    sources: {
      doc: 'The list of git repositories + branch patterns to use.',
      format: Array,
      default: [],
      env: 'CONTENT_SOURCES',
    },
    branches: {
      doc: 'The default branch pattern to use when no specific pattern is provided',
      format: Array,
      default: ['v*', 'master'],
    },
  },
  ui: {
    location: {
      doc: 'The repository that hosts the UI.',
      format: String,
      default: undefined,
    },
    name: {
      doc: 'The name of the UI bundle. Defaults to the repository name.',
      format: String,
      default: undefined,
    },
    ref: {
      doc: 'The reference (or version) of the theme bundle to use.',
      format: String,
      default: undefined,
    },
    archive: {
      doc: 'A local theme archive. If specified, used in place of the UI bundle from the repository.',
      format: String,
      default: undefined,
      arg: 'ui-archive',
    },
    skip_cache: {
      doc: 'Skip the local bundle cache and always fetch the UI bundle from the repository.',
      format: Boolean,
      default: false,
      arg: 'skip-ui-cache',
    },
  },
  runtime: {
    quiet: {
      doc: 'Do not write any messages to stdout.',
      format: Boolean,
      default: false,
      arg: 'quiet',
    },
    silent: {
      doc: 'Suppress all messages.',
      format: Boolean,
      default: false,
      arg: 'silent',
    },
  },
  urls: {
    html_extension_style: {
      doc: 'Controls how the URL extension for HTML pages is handled (default, drop, or indexify).',
      format: ['default', 'drop', 'indexify'],
      default: 'default',
      arg: 'html-url-extension-style',
    },
    aspect_page_strategy: {
      doc: 'Controls how links to pages in aspect domains are generated (path or query).',
      format: ['path', 'query'],
      default: 'path',
      arg: 'aspect-page-url-strategy',
    },
  },
  redirects: {
    doc: 'Generate nginx config file containing URL redirects for page aliases.',
    format: Boolean,
    default: false,
    arg: 'redirects',
  },
}
