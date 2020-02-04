/* eslint-env mocha */
'use strict'

const { expect, heredoc, spy } = require('../../../test/test-utils')
const createPageComposer = require('@antora/page-composer')

describe('createPageComposer()', () => {
  let contentCatalog
  let helpers
  let layouts
  let partials
  let playbook
  let uiCatalog

  const definePartial = (stem, contents) => {
    partials.push({ stem, contents: Buffer.from(contents + '\n') })
  }

  const replaceCallToBodyPartial = (replacement) => {
    const defaultLayout = layouts.find((layout) => layout.stem === 'default')
    defaultLayout.contents = Buffer.from(defaultLayout.contents.toString().replace('{{> body}}', replacement))
  }

  const create404Page = () => ({
    title: 'Page Not Found',
    mediaType: 'text/html',
    src: { stem: '404' },
    out: { path: '404.html' },
    pub: { url: '/404.html', rootPath: '' },
  })

  beforeEach(() => {
    playbook = {
      site: {
        title: 'Docs Site',
      },
      ui: {
        outputDir: '_/',
      },
    }

    helpers = [
      {
        stem: 'upper',
        contents: Buffer.from(
          heredoc`
          module.exports = (str) => str.toUpperCase()
          ` + '\n'
        ),
      },
      {
        stem: 'eq',
        contents: Buffer.from(
          heredoc`
          module.exports = (a, b) => a === b
          ` + '\n'
        ),
      },
      {
        stem: 'get-the-page',
        contents: Buffer.from(
          heredoc`
          module.exports = function ({ data: { root } }) { return root.site.contentCatalog.getById({ version: '0.9' }) }
          ` + '\n'
        ),
      },
    ]

    layouts = [
      {
        stem: 'default',
        contents: Buffer.from(
          heredoc`
          <!DOCTYPE html>
          <html class="default">
          {{> head}}
          {{> body}}
          </html>
          ` + '\n'
        ),
      },
      {
        stem: 'chapter',
        contents: Buffer.from(
          heredoc`
          <!DOCTYPE html>
          <html class="chapter">
          {{> head}}
          {{> body}}
          </html>
          ` + '\n'
        ),
      },
    ]

    partials = [
      {
        stem: 'head',
        contents: Buffer.from(
          heredoc`
          <title>{{page.title}}</title>
          {{#if page.description}}
          <meta name="description" content="{{page.description}}">
          {{/if}}
          ` + '\n'
        ),
      },
      {
        stem: 'body',
        contents: Buffer.from(
          heredoc`
          <article>
            <h1>{{{page.title}}}</h1>
            {{{page.contents}}}
          </article>
          ` + '\n'
        ),
      },
      {
        stem: 'body-upper-title',
        contents: Buffer.from(
          heredoc`
          <h1>{{{upper page.title}}}</h1>
          {{{page.contents}}}
          ` + '\n'
        ),
      },
      {
        stem: 'the-component',
        contents: Buffer.from(
          heredoc`
          {{#each site.components}}
          {{#if (eq . @root.page.component)}}
          <p>The current component is {{./name}}.</p>
          {{/if}}
          {{/each}}
          ` + '\n'
        ),
      },
      {
        stem: 'body-undefined-property-reference',
        contents: Buffer.from(
          heredoc`
          {{#unless page.noSuchThang.name}}
          <p>No such thang.</p>
          {{/unless}}
          ` + '\n'
        ),
      },
    ]

    contentCatalog = {
      getComponentMapSortedBy: (property) => ({}),
      getSiteStartPage: () => undefined,
      exportToModel: () => new Proxy(contentCatalog, {}),
    }

    uiCatalog = {
      findByType: spy((type) => {
        if (type === 'layout') return layouts
        if (type === 'partial') return partials
        if (type === 'helper') return helpers
      }),
    }
  })

  it('should create a page composer function', () => {
    const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
    expect(composePage).to.be.instanceOf(Function)
  })

  it('should operate on helper, partial, and layout files from UI catalog', () => {
    createPageComposer(playbook, contentCatalog, uiCatalog)
    const types = uiCatalog.findByType.__spy.calls.map((call) => call[0]).sort((a, b) => a.localeCompare(b, 'en'))
    expect(types).to.eql(['helper', 'layout', 'partial'])
  })

  describe('composePage()', () => {
    let component
    let components
    let file
    let files
    let menu
    let navigationCatalog

    beforeEach(() => {
      component = {
        name: 'the-component',
        title: 'The Component',
        url: '/the-component/1.0/index.html',
        versions: [
          {
            version: '0.9',
            title: 'The Component',
            url: '/the-component/0.9/index.html',
          },
          {
            version: '1.0',
            title: 'The Component',
            url: '/the-component/1.0/index.html',
          },
        ],
      }

      components = [component]

      files = {
        0.9: {
          contents: Buffer.from('<p>the contents</p>'),
          src: {
            path: 'modules/ROOT/pages/the-page.adoc',
            component: 'the-component',
            version: '0.9',
            module: 'ROOT',
            relative: 'the-page.adoc',
          },
          pub: {
            url: '/the-component/0.9/the-page.html',
            rootPath: '../..',
          },
          asciidoc: {
            doctitle: 'The Page',
            attributes: {
              description: 'The description of the page.',
            },
          },
        },
        '1.0': (file = {
          contents: Buffer.from('<p>the contents</p>'),
          src: {
            path: 'modules/ROOT/pages/the-page.adoc',
            component: 'the-component',
            version: '1.0',
            module: 'ROOT',
            relative: 'the-page.adoc',
          },
          pub: {
            url: '/the-component/1.0/the-page.html',
            rootPath: '../..',
          },
          asciidoc: {
            doctitle: 'The Page',
            attributes: {
              description: 'The description of the page.',
            },
          },
        }),
      }

      contentCatalog = {
        getById: ({ version }) => files[version],
        getComponent: (name) => component,
        getComponentVersion: (component, version) => {
          if (!component.versions) component = this.getComponent(component)
          return component.versions.find((candidate) => candidate.version === version)
        },
        getComponentMapSortedBy: (property) =>
          components
            .slice(0)
            .sort((a, b) => a[property].localeCompare(b[property]))
            .reduce((accum, it) => {
              accum[it.name] = it
              return accum
            }, {}),
        getPages: () => files,
        getSiteStartPage: () => undefined,
        resolvePage: (spec, { component, version }) => {
          if (!spec) {
            throw new Error('invalid page ID')
          } else if (spec === 'the-component::the-page.adoc') {
            return file
          } else if (spec === 'the-page.adoc' && component === 'the-component' && version === '0.9') {
            return files['0.9']
          }
        },
        exportToModel: () => new Proxy(contentCatalog, {}),
      }

      menu = []

      navigationCatalog = {
        getNavigation: (name, version) => menu,
      }
    })

    it('should execute the default template against the UI model', () => {
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      const result = composePage(file, contentCatalog, navigationCatalog)
      expect(result).to.equal(file)
      expect(file.contents).to.be.instanceOf(Buffer)
      expect(file.contents.toString()).to.endWith('\n')
      expect(file.contents.toString().trimRight()).to.equal(heredoc`
        <!DOCTYPE html>
        <html class="default">
        <title>The Page</title>
        <meta name="description" content="The description of the page.">
        <article>
          <h1>The Page</h1>
          <p>the contents</p>
        </article>
        </html>
      `)
    })

    it('should apply helper function to template variable', () => {
      replaceCallToBodyPartial('{{> body-upper-title}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<h1>THE PAGE</h1>')
    })

    it('should not indent preformatted content', () => {
      replaceCallToBodyPartial('  {{> body}}')
      file.contents = Buffer.from(heredoc`
        <pre>a
        b
        c</pre>
      `)
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<pre>a\nb\nc</pre>')
    })

    it('should be able to compare component with entry in component list for equality', () => {
      replaceCallToBodyPartial('{{> the-component}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>The current component is the-component.</p>')
    })

    it('should be able to include a dynamic partial', () => {
      replaceCallToBodyPartial('{{> (lookup page.component "name")}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>The current component is the-component.</p>')
    })

    it('should be able to access a property that is not defined', () => {
      replaceCallToBodyPartial('{{> body-undefined-property-reference}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>No such thang.</p>')
    })

    it('should be able to reference the real environment variables using the env variable', () => {
      const oldEnv = process.env
      try {
        process.env = { FOO: 'BAR' }
        replaceCallToBodyPartial('<body>{{env.FOO}}</body>')
        const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
        composePage(file, contentCatalog, navigationCatalog)
        expect(file.contents.toString()).to.include('<body>BAR</body>')
      } finally {
        process.env = oldEnv
      }
    })

    it('should be able to reference the provided environment variables using the env variable', () => {
      replaceCallToBodyPartial('<body>{{env.FOO}}</body>')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog, { FOO: 'BAR' })
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<body>BAR</body>')
    })

    it('should use default layout specified in playbook', () => {
      playbook.ui.defaultLayout = 'chapter'
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<html class="chapter">')
    })

    it('should use the layout specified by page-layout attribute on file', () => {
      file.asciidoc.attributes['page-layout'] = 'chapter'
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<html class="chapter">')
    })

    it('should use default layout if layout specified in page-layout attribute does not exist', () => {
      file.asciidoc.attributes['page-layout'] = 'does-not-exist'
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<html class="default">')
    })

    // QUESTION should this be checked in the function generator?
    it('should throw an error if default layout cannot be found', () => {
      playbook.ui.defaultLayout = 'does-not-exist'
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      expect(() => composePage(file, contentCatalog, navigationCatalog)).to.throw(/does-not-exist layout not found/i)
    })

    it('should throw an error if layout specified in page-layout attribute does not exist and is default', () => {
      playbook.ui.defaultLayout = 'also-does-not-exist'
      file.asciidoc.attributes['page-layout'] = 'does-not-exist'
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      expect(() => composePage(file, contentCatalog, navigationCatalog)).to.throw(/neither .* layout .* found/i)
    })

    it('should throw an error if 404 layout cannot be found', () => {
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      expect(() => composePage(create404Page(), contentCatalog, navigationCatalog)).to.throw(/404 layout not found/i)
    })

    it('should use 404 layout if component name is not set and stem is 404', () => {
      file = create404Page()
      layouts.push({
        stem: '404',
        contents: Buffer.from(
          heredoc`
          <!DOCTYPE html>
          <html class="status-404">
          {{> head}}
          <link rel="stylesheet" href="{{uiRootPath}}/css/site.css">
          <h1>{{{page.title}}}</h1>
          </html>
          ` + '\n'
        ),
      })
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      const result = composePage(file, contentCatalog, navigationCatalog)
      expect(result).to.equal(file)
      expect(file.contents).to.be.instanceOf(Buffer)
      expect(file.contents.toString()).to.endWith('\n')
      expect(file.contents.toString().trimRight()).to.equal(heredoc`
        <!DOCTYPE html>
        <html class="status-404">
        <title>Page Not Found</title>
        <link rel="stylesheet" href="/_/css/site.css">
        <h1>Page Not Found</h1>
        </html>
      `)
    })

    it('should prepend site path to UI root path if site URL contains a subpath', () => {
      file = create404Page()
      layouts.push({
        stem: '404',
        contents: Buffer.from(
          heredoc`
          <!DOCTYPE html>
          <html class="status-404">
          {{> head}}
          <link rel="stylesheet" href="{{uiRootPath}}/css/site.css">
          <h1>{{{page.title}}}</h1>
          </html>
          ` + '\n'
        ),
      })
      playbook.site.url = 'https://example.org/docs'
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      const result = composePage(file, contentCatalog, navigationCatalog)
      expect(result).to.equal(file)
      expect(file.contents).to.be.instanceOf(Buffer)
      expect(file.contents.toString()).to.endWith('\n')
      expect(file.contents.toString().trimRight()).to.equal(heredoc`
        <!DOCTYPE html>
        <html class="status-404">
        <title>Page Not Found</title>
        <link rel="stylesheet" href="/docs/_/css/site.css">
        <h1>Page Not Found</h1>
        </html>
      `)
    })

    it('should be able to access content catalog from helper', () => {
      definePartial(
        'body-get-the-page',
        heredoc`
        {{#with (get-the-page)}}
        <p>{{./pub.url}}</p>
        {{/with}}
        `
      )
      replaceCallToBodyPartial('{{> body-get-the-page}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/0.9/the-page.html</p>')
    })

    it('should be able to call built-in helper to resolve page', () => {
      definePartial(
        'body-resolve-page',
        heredoc`
        {{#with (resolvePage 'the-component::the-page.adoc')}}
        <p>{{./pub.url}}</p>
        {{/with}}
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/1.0/the-page.html</p>')
    })

    it('should be able to call built-in helper to resolve URL of page', () => {
      definePartial(
        'body-resolve-page-url',
        heredoc`
        <p>{{resolvePageUrl 'the-component::the-page.adoc'}}</p>
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-url}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/1.0/the-page.html</p>')
    })

    it('should not crash when calling built-in helper to resolve page if spec is falsy', () => {
      definePartial(
        'body-resolve-page-falsy',
        heredoc`
        {{#with (resolvePage page.attributes.no-such-page)}}
        <p>{{./pub.url}}</p>
        {{else}}
        <p>no such page</p>
        {{/with}}
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-falsy}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>no such page</p>')
    })

    it('should not crash when calling built-in helper to resolve page URL if spec is falsy', () => {
      definePartial(
        'body-resolve-page-url-falsy',
        heredoc`
        <p>{{resolvePageUrl page.attributes.no-such-page}}</p>
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-url-falsy}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p></p>')
    })

    it('should be able to call built-in helper to resolve page inside #with block', () => {
      definePartial(
        'body-resolve-page-inside-with',
        heredoc`
        {{#with page.component}}
        {{#with (resolvePage 'the-component::the-page.adoc')}}
        <p>{{./pub.url}}</p>
        {{/with}}
        {{/with}}
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-inside-with}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/1.0/the-page.html</p>')
    })

    it('should be able to call built-in helper to resolve URL of page inside #with block', () => {
      definePartial(
        'body-resolve-page-url-inside-with',
        heredoc`
        {{#with page.component}}
        <p>{{resolvePageUrl 'the-component::the-page.adoc'}}</p>
        {{/with}}
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-url-inside-with}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/1.0/the-page.html</p>')
    })

    it('should be able to call built-in helper with context to resolve page', () => {
      definePartial(
        'body-resolve-page-from-context',
        heredoc`
        {{#with (resolvePage 'the-page.adoc' component=page.component.name version='0.9')}}
        <p>{{./pub.url}}</p>
        {{/with}}
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-from-context}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/0.9/the-page.html</p>')
    })

    it('should be able to call built-in helper with context to resolve URL of page', () => {
      definePartial(
        'body-resolve-page-url-from-context',
        heredoc`
        <p>{{resolvePageUrl 'the-page.adoc' component=page.component.name version='0.9'}}</p>
        `
      )
      replaceCallToBodyPartial('{{> body-resolve-page-url-from-context}}')
      const composePage = createPageComposer(playbook, contentCatalog, uiCatalog)
      composePage(file, contentCatalog, navigationCatalog)
      expect(file.contents.toString()).to.include('<p>/the-component/0.9/the-page.html</p>')
    })

    // QUESTION what should we do with a template execution error? (e.g., missing partial or helper)
  })
})
