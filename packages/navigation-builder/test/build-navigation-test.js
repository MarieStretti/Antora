/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, heredoc } = require('../../../test/test-utils')

const buildNavigation = require('@antora/navigation-builder')
const mockContentCatalog = require('../../../test/mock-content-catalog')

describe('buildNavigation()', () => {
  it('should run on all files in the navigation family', async () => {
    const contentCatalog = mockContentCatalog().spyOn('findBy')
    await buildNavigation(contentCatalog)
    expectCalledWith(contentCatalog.findBy, { family: 'navigation' })
  })

  it('should build single navigation list with title', async () => {
    const navContents = heredoc`
      .xref:index.adoc[Module A]
      * xref:requirements.adoc[Requirements]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'index.adoc' },
      { family: 'page', relative: 'requirements.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(1)
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'Module A',
      url: '/component-a/module-a/index.html',
      urlType: 'internal',
      items: [
        {
          content: 'Requirements',
          url: '/component-a/module-a/requirements.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should build single navigation list without title', async () => {
    const navContents = heredoc`
      * xref:index.adoc[Module A]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'index.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(1)
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      items: [
        {
          content: 'Module A',
          url: '/component-a/module-a/index.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should build navigation across multiple components', async () => {
    const navContentsA = heredoc`
      .xref:index.adoc[Component A]
      * xref:the-page.adoc[The Page]
    `
    const navContentsB = heredoc`
      .xref:index.adoc[Component B]
      * xref:the-page.adoc[The Page]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContentsA,
        navIndex: 0,
      },
      {
        component: 'component-b',
        module: 'ROOT',
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContentsB,
        navIndex: 0,
      },
      { family: 'page', relative: 'index.adoc' },
      { family: 'page', relative: 'the-page.adoc' },
      { component: 'component-b', module: 'ROOT', family: 'page', relative: 'index.adoc' },
      { component: 'component-b', module: 'ROOT', family: 'page', relative: 'the-page.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menuA = navCatalog.getMenu('component-a', 'master')
    expect(menuA).to.exist()
    expect(menuA).to.have.lengthOf(1)
    expect(menuA[0]).to.eql({
      order: 0,
      root: true,
      content: 'Component A',
      url: '/component-a/module-a/index.html',
      urlType: 'internal',
      items: [
        {
          content: 'The Page',
          url: '/component-a/module-a/the-page.html',
          urlType: 'internal',
        },
      ],
    })
    const menuB = navCatalog.getMenu('component-b', 'master')
    expect(menuB).to.exist()
    expect(menuB).to.have.lengthOf(1)
    expect(menuB[0]).to.eql({
      order: 0,
      root: true,
      content: 'Component B',
      url: '/component-b/index.html',
      urlType: 'internal',
      items: [
        {
          content: 'The Page',
          url: '/component-b/the-page.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should resolve page references relative to module of navigation file', async () => {
    const navContents = heredoc`
      * xref:page-a.adoc[This Module]
      * xref:module-b:page-b.adoc[Other Module]
      * xref:0.9@page-c.adoc#detail[Older Version]
      * xref:component-b::page-d.adoc[Other Component]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'page-a.adoc' },
      { module: 'module-b', family: 'page', relative: 'page-b.adoc' },
      { version: '0.9', family: 'page', relative: 'page-c.adoc' },
      { component: 'component-b', version: '1.1', module: 'ROOT', family: 'page', relative: 'page-d.adoc' },
    ]).spyOn('getById', 'getComponent')
    await buildNavigation(contentCatalog)
    expectCalledWith(
      contentCatalog.getById,
      [
        {
          component: 'component-a',
          version: 'master',
          module: 'module-a',
          family: 'page',
          relative: 'page-a.adoc',
        },
      ],
      0
    )
    expectCalledWith(
      contentCatalog.getById,
      [
        {
          component: 'component-a',
          version: 'master',
          module: 'module-b',
          family: 'page',
          relative: 'page-b.adoc',
        },
      ],
      1
    )
    expectCalledWith(
      contentCatalog.getById,
      [
        {
          component: 'component-a',
          version: '0.9',
          module: 'module-a',
          family: 'page',
          relative: 'page-c.adoc',
        },
      ],
      2
    )
    expectCalledWith(contentCatalog.getComponent, 'component-b')
    expectCalledWith(
      contentCatalog.getById,
      [
        {
          component: 'component-b',
          version: '1.1',
          module: 'ROOT',
          family: 'page',
          relative: 'page-d.adoc',
        },
      ],
      3
    )
  })

  it('should store url for page reference as root relative path with urlType set to internal', async () => {
    const navContents = heredoc`
      * xref:page-a.adoc[This Module]
      * xref:module-b:page-b.adoc[Other Module]
      * xref:0.9@page-c.adoc#detail[Older Version]
      * xref:component-b::page-d.adoc[Other Component]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'page-a.adoc' },
      { module: 'module-b', family: 'page', relative: 'page-b.adoc' },
      { version: '0.9', family: 'page', relative: 'page-c.adoc' },
      { component: 'component-b', version: 'master', module: 'ROOT', family: 'page', relative: 'page-d.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      items: [
        {
          content: 'This Module',
          url: '/component-a/module-a/page-a.html',
          urlType: 'internal',
        },
        {
          content: 'Other Module',
          url: '/component-a/module-b/page-b.html',
          urlType: 'internal',
        },
        {
          content: 'Older Version',
          url: '/component-a/0.9/module-a/page-c.html#detail',
          urlType: 'internal',
        },
        {
          content: 'Other Component',
          url: '/component-b/page-d.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should allow navigation file to be outside of module', async () => {
    const navContents = heredoc`
      * xref:ROOT:index.adoc[Basics]
       ** xref:basics:requirements.adoc[Requirements]
      * xref:advanced:index.adoc[Advanced]
       ** xref:advanced:caching.adoc[Caching]
    `
    const contentCatalog = mockContentCatalog([
      {
        module: '',
        family: 'navigation',
        relative: 'modules/nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { module: 'ROOT', family: 'page', relative: 'index.adoc' },
      { module: 'basics', family: 'page', relative: 'requirements.adoc' },
      { module: 'advanced', family: 'page', relative: 'index.adoc' },
      { module: 'advanced', family: 'page', relative: 'caching.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(1)
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      items: [
        {
          content: 'Basics',
          url: '/component-a/index.html',
          urlType: 'internal',
          items: [
            {
              content: 'Requirements',
              url: '/component-a/basics/requirements.html',
              urlType: 'internal',
            },
          ],
        },
        {
          content: 'Advanced',
          url: '/component-a/advanced/index.html',
          urlType: 'internal',
          items: [
            {
              content: 'Caching',
              url: '/component-a/advanced/caching.html',
              urlType: 'internal',
            },
          ],
        },
      ],
    })
  })

  it('should allow navigation file to be in subdirectory of module', async () => {
    const navContents = heredoc`
      .By Level
      * xref:index.adoc[Basics]
       ** xref:basics:requirements.adoc[Requirements]
      * xref:advanced:index.adoc[Advanced]
       ** xref:advanced:caching.adoc[Caching]
    `
    const contentCatalog = mockContentCatalog([
      {
        module: 'ROOT',
        family: 'navigation',
        relative: 'nav/level.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { module: 'ROOT', family: 'page', relative: 'index.adoc' },
      { module: 'basics', family: 'page', relative: 'requirements.adoc' },
      { module: 'advanced', family: 'page', relative: 'index.adoc' },
      { module: 'advanced', family: 'page', relative: 'caching.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(1)
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'By Level',
      items: [
        {
          content: 'Basics',
          url: '/component-a/index.html',
          urlType: 'internal',
          items: [
            {
              content: 'Requirements',
              url: '/component-a/basics/requirements.html',
              urlType: 'internal',
            },
          ],
        },
        {
          content: 'Advanced',
          url: '/component-a/advanced/index.html',
          urlType: 'internal',
          items: [
            {
              content: 'Caching',
              url: '/component-a/advanced/caching.html',
              urlType: 'internal',
            },
          ],
        },
      ],
    })
  })

  it('should allow items to link to external URLs or fragments', async () => {
    const navContents = heredoc`
      .xref:asciidoc/index.adoc[AsciiDoc]
      * xref:asciidoc/syntax-primer.adoc[Syntax Primer]
      * http://asciidoctor.org/docs/user-manual/[Asciidoctor User Manual]
      * link:#[Back to top]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'asciidoc/index.adoc' },
      { family: 'page', relative: 'asciidoc/syntax-primer.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'AsciiDoc',
      url: '/component-a/module-a/asciidoc/index.html',
      urlType: 'internal',
      items: [
        {
          content: 'Syntax Primer',
          url: '/component-a/module-a/asciidoc/syntax-primer.html',
          urlType: 'internal',
        },
        {
          content: 'Asciidoctor User Manual',
          url: 'http://asciidoctor.org/docs/user-manual/',
          urlType: 'external',
        },
        {
          content: 'Back to top',
          url: '#',
          urlType: 'fragment',
        },
      ],
    })
  })

  // Q: should we allow link to be anywhere in content?
  it('should only recognize a single link per item', async () => {
    const navContents = heredoc`
      .Module A
      * xref:page-a.adoc[Page A] xref:page-b.adoc[Page B]
      * See xref:page-c.adoc[Page C]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'page-a.adoc' },
      { family: 'page', relative: 'page-b.adoc' },
      { family: 'page', relative: 'page-c.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'Module A',
      items: [
        {
          content: 'Page A',
          url: '/component-a/module-a/page-a.html',
          urlType: 'internal',
        },
        {
          content: 'Page C',
          url: '/component-a/module-a/page-c.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should allow navigation items to be text-only', async () => {
    const navContents = heredoc`
      .Module A
      * Basics
       ** xref:installation.adoc[Installation]
      * Advanced
       ** xref:tuning-performance.adoc[Tuning Performance]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'installation.adoc' },
      { family: 'page', relative: 'tuning-performance.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'Module A',
      items: [
        {
          content: 'Basics',
          items: [
            {
              content: 'Installation',
              url: '/component-a/module-a/installation.html',
              urlType: 'internal',
            },
          ],
        },
        {
          content: 'Advanced',
          items: [
            {
              content: 'Tuning Performance',
              url: '/component-a/module-a/tuning-performance.html',
              urlType: 'internal',
            },
          ],
        },
      ],
    })
  })

  it('should allow navigation items to contain formatted text', async () => {
    const navContents = heredoc`
      ._Module A_
      * *Commands*
       ** xref:command/install.adoc[Install (\`i\`)]
       ** xref:command/remove.adoc[Remove (\`rm\`)]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'command/install.adoc' },
      { family: 'page', relative: 'command/remove.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: '<em>Module A</em>',
      items: [
        {
          content: '<strong>Commands</strong>',
          items: [
            {
              content: 'Install (<code>i</code>)',
              url: '/component-a/module-a/command/install.html',
              urlType: 'internal',
            },
            {
              content: 'Remove (<code>rm</code>)',
              url: '/component-a/module-a/command/remove.html',
              urlType: 'internal',
            },
          ],
        },
      ],
    })
  })

  it('should allow navigation items to be nested (up to 5 levels)', async () => {
    const navContents = heredoc`
      * xref:basics.adoc[Basics]
       ** xref:install.adoc[Install]
        *** xref:install/desktop.adoc[Desktop]
         **** xref:install/linux.adoc[Linux]
          ***** xref:install/fedora.adoc[Fedora]
      * xref:requirements.adoc[Requirements]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'basics.adoc' },
      { family: 'page', relative: 'install.adoc' },
      { family: 'page', relative: 'install/desktop.adoc' },
      { family: 'page', relative: 'install/linux.adoc' },
      { family: 'page', relative: 'install/fedora.adoc' },
      { family: 'page', relative: 'requirements.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      items: [
        {
          content: 'Basics',
          url: '/component-a/module-a/basics.html',
          urlType: 'internal',
          items: [
            {
              content: 'Install',
              url: '/component-a/module-a/install.html',
              urlType: 'internal',
              items: [
                {
                  content: 'Desktop',
                  url: '/component-a/module-a/install/desktop.html',
                  urlType: 'internal',
                  items: [
                    {
                      content: 'Linux',
                      url: '/component-a/module-a/install/linux.html',
                      urlType: 'internal',
                      items: [
                        {
                          content: 'Fedora',
                          url: '/component-a/module-a/install/fedora.html',
                          urlType: 'internal',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          content: 'Requirements',
          url: '/component-a/module-a/requirements.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should process navigation file containing multiple lists', async () => {
    const navContents = heredoc`
      .xref:basics.adoc[Basics]
      * xref:requirements.adoc[Requirements]

      .xref:hosting.adoc[Hosting]
      * xref:gitlab-pages.adoc[GitLab Pages]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'basics.adoc' },
      { family: 'page', relative: 'requirements.adoc' },
      { family: 'page', relative: 'hosting.adoc' },
      { family: 'page', relative: 'gitlab-pages.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(2)
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'Basics',
      url: '/component-a/module-a/basics.html',
      urlType: 'internal',
      items: [
        {
          content: 'Requirements',
          url: '/component-a/module-a/requirements.html',
          urlType: 'internal',
        },
      ],
    })
    expect(menu[1]).to.eql({
      order: 0.5,
      root: true,
      content: 'Hosting',
      url: '/component-a/module-a/hosting.html',
      urlType: 'internal',
      items: [
        {
          content: 'GitLab Pages',
          url: '/component-a/module-a/gitlab-pages.html',
          urlType: 'internal',
        },
      ],
    })
  })

  it('should order trees from multiple navigation files by index of navigation file', async () => {
    const contentCatalog = mockContentCatalog([
      {
        module: 'module-a',
        family: 'navigation',
        relative: 'nav.adoc',
        contents: '.xref:index.adoc[Module A]\n* xref:the-page.adoc[Page in A]',
        navIndex: 2,
      },
      {
        module: 'module-b',
        family: 'navigation',
        relative: 'nav.adoc',
        contents: '.xref:index.adoc[Module B]\n* xref:the-page.adoc[Page in B]',
        navIndex: 3,
      },
      {
        module: 'module-c',
        family: 'navigation',
        relative: 'nav.adoc',
        contents: heredoc`
          .xref:index.adoc[Module C]
          * xref:the-page.adoc[Page in C]

          .xref:more/index.adoc[More Module C]
          * xref:more/the-page.adoc[Page in More C]
        `,
        navIndex: 1,
      },
      {
        module: 'module-d',
        family: 'navigation',
        relative: 'nav.adoc',
        contents: '.xref:index.adoc[Module D]\n* xref:the-page.adoc[Page in D]',
        navIndex: 0,
      },
      { module: 'module-a', family: 'page', relative: 'index.adoc' },
      { module: 'module-a', family: 'page', relative: 'the-page.adoc' },
      { module: 'module-b', family: 'page', relative: 'index.adoc' },
      { module: 'module-b', family: 'page', relative: 'the-page.adoc' },
      { module: 'module-c', family: 'page', relative: 'index.adoc' },
      { module: 'module-c', family: 'page', relative: 'the-page.adoc' },
      { module: 'module-c', family: 'page', relative: 'more/index.adoc' },
      { module: 'module-c', family: 'page', relative: 'more/the-page.adoc' },
      { module: 'module-d', family: 'page', relative: 'index.adoc' },
      { module: 'module-d', family: 'page', relative: 'the-page.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(5)
    expect(menu[0].root).to.be.true()
    expect(menu[0].order).to.equal(0)
    expect(menu[0].content).to.equal('Module D')
    expect(menu[1].root).to.be.true()
    expect(menu[1].order).to.equal(1)
    expect(menu[1].content).to.equal('Module C')
    expect(menu[2].root).to.be.true()
    expect(menu[2].order).to.equal(1.5)
    expect(menu[2].content).to.equal('More Module C')
    expect(menu[3].root).to.be.true()
    expect(menu[3].order).to.equal(2)
    expect(menu[3].content).to.equal('Module A')
    expect(menu[4].root).to.be.true()
    expect(menu[4].order).to.equal(3)
    expect(menu[4].content).to.equal('Module B')
  })

  it('should skip blocks that are not unordered lists', async () => {
    const navContents = heredoc`
      This paragraph should be skipped.

      .xref:basics.adoc[Basics]
      * xref:requirements.adoc[Requirements]
       .. This list should be discarded.
        *** This list should not be recognized.

      ----
      This listing block is ignored.
      ----

      .xref:hosting.adoc[Hosting]
      * xref:gitlab-pages.adoc[GitLab Pages]

      //^
      . This list should be throw away.
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      { family: 'page', relative: 'basics.adoc' },
      { family: 'page', relative: 'requirements.adoc' },
      { family: 'page', relative: 'hosting.adoc' },
      { family: 'page', relative: 'gitlab-pages.adoc' },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(2)
    expect(menu[0].content).to.equal('Basics')
    expect(menu[1].content).to.equal('Hosting')
  })

  it('should skip navigation file if it contains no unordered lists', async () => {
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: 'Sorry, no lists here :(',
        navIndex: 0,
      },
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: '.Basics\n* xref:first-steps.adoc[First Steps]',
        navIndex: 1,
      },
    ])
    const navCatalog = await buildNavigation(contentCatalog)
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(1)
    expect(menu[0].content).to.equal('Basics')
  })

  // FIXME we want to support includes relative to nav.adoc, but those files aren't added to catalog
  // we could classify files in the nav directory as navigation without a nav.index property
  // another option is to move partials from pages/_partials to partials; then partials/nav makes sense
  it('should support navigation file with includes', async () => {
    const navContents = heredoc`
      .xref:index.adoc[Basics]
      include::{partialsdir}/nav/basics.adoc[]

      .xref:advanced/index.adoc[Advanced]
      include::{partialsdir}/nav/advanced.adoc[]
    `
    const contentCatalog = mockContentCatalog([
      {
        family: 'navigation',
        relative: 'nav.adoc',
        contents: navContents,
        navIndex: 0,
      },
      {
        family: 'partial',
        relative: 'nav/basics.adoc',
        contents: '* xref:basics/requirements.adoc[Requirements]',
      },
      {
        family: 'partial',
        relative: 'nav/advanced.adoc',
        contents: '* xref:advanced/caching.adoc[Caching]',
      },
      { family: 'page', relative: 'index.adoc' },
      { family: 'page', relative: 'basics/requirements.adoc' },
      { family: 'page', relative: 'advanced/index.adoc' },
      { family: 'page', relative: 'advanced/caching.adoc' },
    ]).spyOn('getById')
    const navCatalog = await buildNavigation(contentCatalog)
    expectCalledWith(
      contentCatalog.getById,
      [
        {
          component: 'component-a',
          version: 'master',
          module: 'module-a',
          family: 'partial',
          relative: 'nav/basics.adoc',
        },
      ],
      0
    )
    expectCalledWith(
      contentCatalog.getById,
      [
        {
          component: 'component-a',
          version: 'master',
          module: 'module-a',
          family: 'partial',
          relative: 'nav/advanced.adoc',
        },
      ],
      1
    )
    const menu = navCatalog.getMenu('component-a', 'master')
    expect(menu).to.exist()
    expect(menu).to.have.lengthOf(2)
    expect(menu[0]).to.eql({
      order: 0,
      root: true,
      content: 'Basics',
      url: '/component-a/module-a/index.html',
      urlType: 'internal',
      items: [
        {
          content: 'Requirements',
          url: '/component-a/module-a/basics/requirements.html',
          urlType: 'internal',
        },
      ],
    })
    expect(menu[1]).to.eql({
      order: 0.5,
      root: true,
      content: 'Advanced',
      url: '/component-a/module-a/advanced/index.html',
      urlType: 'internal',
      items: [
        {
          content: 'Caching',
          url: '/component-a/module-a/advanced/caching.html',
          urlType: 'internal',
        },
      ],
    })
  })
})
