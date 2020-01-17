/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, heredoc, spy } = require('../../../test/test-utils')

const { convertDocument } = require('@antora/document-converter')
const { resolveConfig: resolveAsciiDocConfig } = require('@antora/asciidoc-loader')

describe('convertDocument()', () => {
  let inputFile
  let inputFileInTopicFolder
  let playbook
  let asciidocConfig

  const expectPageLink = (html, url, content) => expect(html).to.include(`<a href="${url}" class="page">${content}</a>`)

  beforeEach(() => {
    playbook = {
      site: {
        title: 'Docs',
        url: 'https://docs.example.org',
      },
    }
    asciidocConfig = resolveAsciiDocConfig(playbook)
    inputFile = {
      path: 'modules/module-a/pages/page-a.adoc',
      dirname: 'modules/module-a/pages',
      mediaType: 'text/asciidoc',
      src: {
        path: 'modules/module-a/pages/page-a.adoc',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relative: 'page-a.adoc',
        basename: 'page-a.adoc',
        stem: 'page-a',
        extname: '.adoc',
        mediaType: 'text/asciidoc',
        moduleRootPath: '..',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/page-a.html',
        moduleRootPath: '.',
        rootPath: '../../..',
      },
    }
    inputFileInTopicFolder = {
      path: 'modules/module-a/pages/topic/page-b.adoc',
      dirname: 'modules/module-a/pages/topic',
      mediaType: 'text/asciidoc',
      src: {
        path: 'modules/module-a/pages/topic/page-b.adoc',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relative: 'topic/page-b.adoc',
        basename: 'page-b.adoc',
        stem: 'page-b',
        extname: '.adoc',
        mediaType: 'text/asciidoc',
        moduleRootPath: '../..',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/topic/page-b.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      },
    }
  })

  it('should convert AsciiDoc contents on file to embeddable HTML', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title

      == Section Title

      Grab the link:{attachmentsdir}/quickstart-project.zip[quickstart project].

      * list item 1
      * list item 2
      * list item 3

      image::screenshot.png[]
    `)
    convertDocument(inputFile, undefined, asciidocConfig)
    expect(inputFile.mediaType).to.equal('text/html')
    expect(inputFile.contents.toString()).to.equal(heredoc`
      <div class="sect1">
      <h2 id="_section_title"><a class="anchor" href="#_section_title"></a>Section Title</h2>
      <div class="sectionbody">
      <div class="paragraph">
      <p>Grab the <a href="_attachments/quickstart-project.zip">quickstart project</a>.</p>
      </div>
      <div class="ulist">
      <ul>
      <li>
      <p>list item 1</p>
      </li>
      <li>
      <p>list item 2</p>
      </li>
      <li>
      <p>list item 3</p>
      </li>
      </ul>
      </div>
      <div class="imageblock">
      <div class="content">
      <img src="_images/screenshot.png" alt="screenshot">
      </div>
      </div>
      </div>
      </div>
    `)
  })

  it('should resolve attachment relative to module root', () => {
    inputFileInTopicFolder.contents = Buffer.from(heredoc`
      Grab the link:{attachmentsdir}/quickstart-project.zip[quickstart project].
    `)
    convertDocument(inputFileInTopicFolder, undefined, asciidocConfig)
    const contents = inputFileInTopicFolder.contents.toString()
    expect(contents).to.include('href="../_attachments/quickstart-project.zip"')
  })

  it('should convert file using default settings if AsciiDoc config is not specified', () => {
    inputFile.contents = Buffer.from(heredoc`
      == Heading

      NOTE: Icons not enabled.
    `)
    convertDocument(inputFile)
    expect(inputFile.asciidoc).to.exist()
    const contents = inputFile.contents.toString()
    expect(contents).to.include('<h2 id="_heading">Heading</h2>')
    expect(contents).to.not.include('<i class="fa')
  })

  it('should set formatted document title to asciidoc.doctitle property on file object', () => {
    inputFile.contents = Buffer.from(heredoc`
      = _Awesome_ Document Title

      article contents
    `)
    convertDocument(inputFile, undefined, asciidocConfig)
    expect(inputFile.asciidoc).to.exist()
    expect(inputFile.asciidoc.doctitle).to.equal('<em>Awesome</em> Document Title')
  })

  it('should not set asciidoc.doctitle property on file object if document has no header', () => {
    inputFile.contents = Buffer.from(heredoc`
      article contents only
    `)
    convertDocument(inputFile, undefined, asciidocConfig)
    expect(inputFile.asciidoc).to.exist()
    expect(inputFile.asciidoc.doctitle).to.not.exist()
  })

  it('should save document header attributes to asciidoc.attributes property on file object', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Document Title
      :keywords: CSS, flexbox, layout, box model

      article contents
    `)
    convertDocument(inputFile, undefined, asciidocConfig)
    expect(inputFile.asciidoc).to.exist()
    const attrs = inputFile.asciidoc.attributes
    expect(attrs).to.exist()
    expect(attrs).to.include({
      docfile: inputFile.path,
      env: 'site',
      imagesdir: '_images',
      keywords: 'CSS, flexbox, layout, box model',
    })
  })

  it('should pass custom attributes to processor', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Document Title

      Get there in a flash with {product-name}.
    `)
    const customAttributes = {
      'product-name': 'Hi-Speed Tonic',
      'source-highlighter': 'html-pipeline',
    }
    Object.assign(asciidocConfig.attributes, customAttributes)
    convertDocument(inputFile, undefined, asciidocConfig)
    expect(inputFile.contents.toString()).to.include(customAttributes['product-name'])
    expect(inputFile.asciidoc).to.exist()
    expect(inputFile.asciidoc.attributes).to.exist()
    expect(inputFile.asciidoc.attributes).to.include(customAttributes)
  })

  it('should register aliases defined by page-aliases document attribute', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title
      :page-aliases: the-alias.adoc,topic/the-alias, 1.0.0@page-a.adoc ,another-alias.adoc

      Page content.
    `)
    const contentCatalog = { registerPageAlias: spy(() => {}), getComponent: () => {} }
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expect(contentCatalog.registerPageAlias).to.have.been.called.exactly(4)
    expectCalledWith(contentCatalog.registerPageAlias, ['the-alias.adoc', inputFile], 0)
    expectCalledWith(contentCatalog.registerPageAlias, ['topic/the-alias', inputFile], 1)
    expectCalledWith(contentCatalog.registerPageAlias, ['1.0.0@page-a.adoc', inputFile], 2)
    expectCalledWith(contentCatalog.registerPageAlias, ['another-alias.adoc', inputFile], 3)
  })

  it('should register aliases broken across lines using a line continuation', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title
      :page-aliases: the-alias.adoc, \
                     topic/the-alias, \
      1.0.0@page-a.adoc , \
      another-alias.adoc

      Page content.
    `)
    const contentCatalog = { registerPageAlias: spy(() => {}), getComponent: () => {} }
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expect(contentCatalog.registerPageAlias).to.have.been.called.exactly(4)
    expectCalledWith(contentCatalog.registerPageAlias, ['the-alias.adoc', inputFile], 0)
    expectCalledWith(contentCatalog.registerPageAlias, ['topic/the-alias', inputFile], 1)
    expectCalledWith(contentCatalog.registerPageAlias, ['1.0.0@page-a.adoc', inputFile], 2)
    expectCalledWith(contentCatalog.registerPageAlias, ['another-alias.adoc', inputFile], 3)
  })

  it('should not register aliases if page-aliases document attribute is empty', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title
      :page-aliases:

      Page content.
    `)
    const contentCatalog = { registerPageAlias: spy(() => {}), getComponent: () => {} }
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expect(contentCatalog.registerPageAlias).to.not.have.been.called()
  })

  it('should convert page reference to URL of page in content catalog', () => {
    inputFile.contents = Buffer.from('xref:module-b:page-b.adoc[Page B]')
    const targetFile = {
      pub: {
        url: '/component-a/1.2.3/module-b/page-b.html',
      },
    }
    const contentCatalog = { resolvePage: spy(() => targetFile), getComponent: () => {} }
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expectCalledWith(contentCatalog.resolvePage, ['module-b:page-b', inputFile.src])
    expectPageLink(inputFile.contents.toString(), '../module-b/page-b.html', 'Page B')
  })

  it('should resolve target of include directive to file in content catalog', () => {
    inputFile.contents = Buffer.from('include::{partialsdir}/definitions.adoc[]')
    const partialFile = {
      path: 'modules/module-a/pages/_partials/definitions.adoc',
      dirname: 'modules/module-a/pages/_partials',
      contents: Buffer.from("cloud: someone else's computer"),
      src: {
        path: 'modules/module-a/pages/_partials/definitions.adoc',
        dirname: 'modules/module-a/pages/_partials',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        relative: 'definitions.adoc',
      },
    }
    const contentCatalog = { getById: spy(() => partialFile), getComponent: () => {} }
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expectCalledWith(contentCatalog.getById, {
      component: 'component-a',
      version: '1.2.3',
      module: 'module-a',
      family: 'partial',
      relative: 'definitions.adoc',
    })
    expect(inputFile.contents.toString()).to.include('cloud: someone else&#8217;s computer')
  })

  it('should be able to include which has already been converted', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title

      == Recent Changes

      include::changelog.adoc[tag=entries,leveloffset=+1]
    `)
    const includedFile = {
      path: 'modules/module-a/pages/changelog.adoc',
      dirname: 'modules/module-a/pages',
      contents: Buffer.from(heredoc`
        = Changelog

        // tag::entries[]
        == Version 1.1

        * Bug fixes.
        // end::entries[]
      `),
      src: {
        path: 'modules/module-a/pages/changelog.adoc',
        dirname: 'modules/module-a/pages',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relative: 'changelog.adoc',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/changelog.html',
        moduleRootPath: '..',
        rootPath: '../../..',
      },
    }
    const contentCatalog = { getByPath: spy(() => includedFile), getComponent: () => {} }
    convertDocument(includedFile, undefined, asciidocConfig)
    expect(includedFile.src).to.have.property('contents')
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expectCalledWith(contentCatalog.getByPath, {
      component: 'component-a',
      version: '1.2.3',
      path: 'modules/module-a/pages/changelog.adoc',
    })
    expect(inputFile.contents.toString()).to.include(heredoc`
      <div class="sect1">
      <h2 id="_recent_changes"><a class="anchor" href="#_recent_changes"></a>Recent Changes</h2>
      <div class="sectionbody">
      <div class="sect2">
      <h3 id="_version_1_1"><a class="anchor" href="#_version_1_1"></a>Version 1.1</h3>
      <div class="ulist">
      <ul>
      <li>
      <p>Bug fixes.</p>
      </li>
      </ul>
      </div>
      </div>
      </div>
      </div>
    `)
  })

  it('should be able to include a page marked as a partial which has already been converted', () => {
    playbook.asciidoc = { attributes: { 'page-partial': false } }
    asciidocConfig = resolveAsciiDocConfig(playbook)
    inputFile.contents = Buffer.from(heredoc`
      = Page Title

      == Recent Changes

      include::changelog.adoc[tag=entries,leveloffset=+1]
    `)
    const includedFile = {
      path: 'modules/module-a/pages/changelog.adoc',
      dirname: 'modules/module-a/pages',
      contents: Buffer.from(heredoc`
        = Changelog
        :page-partial:

        // tag::entries[]
        == Version 1.1

        * Bug fixes.
        // end::entries[]
      `),
      src: {
        path: 'modules/module-a/pages/changelog.adoc',
        dirname: 'modules/module-a/pages',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relative: 'changelog.adoc',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/changelog.html',
        moduleRootPath: '..',
        rootPath: '../../..',
      },
    }
    const contentCatalog = { getByPath: spy(() => includedFile), getComponent: () => {} }
    convertDocument(includedFile, undefined, asciidocConfig)
    expect(includedFile.src).to.have.property('contents')
    convertDocument(inputFile, contentCatalog, asciidocConfig)
    expectCalledWith(contentCatalog.getByPath, {
      component: 'component-a',
      version: '1.2.3',
      path: 'modules/module-a/pages/changelog.adoc',
    })
    expect(inputFile.contents.toString()).to.include(heredoc`
      <div class="sect1">
      <h2 id="_recent_changes"><a class="anchor" href="#_recent_changes"></a>Recent Changes</h2>
      <div class="sectionbody">
      <div class="sect2">
      <h3 id="_version_1_1"><a class="anchor" href="#_version_1_1"></a>Version 1.1</h3>
      <div class="ulist">
      <ul>
      <li>
      <p>Bug fixes.</p>
      </li>
      </ul>
      </div>
      </div>
      </div>
      </div>
    `)
  })
  ;['block', 'inline'].forEach((macroType) => {
    const macroDelim = macroType === 'block' ? '::' : ':'

    it(`should resolve target of ${macroType} image relative to imagesdir`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}image-filename.png[]`)
      convertDocument(inputFile, undefined, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="_images/image-filename.png" alt="image filename">')
    })

    // NOTE this scenario should be disallowed in a future major release
    it(`should honor parent reference in target of ${macroType} image`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}../../module-b/_images/image-filename.png[]`)
      convertDocument(inputFile, undefined, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="../module-b/_images/image-filename.png" alt="image filename">')
    })

    it(`should preserve target of ${macroType} image if target is a URL`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}https://example.org/image-filename.png[]`)
      convertDocument(inputFile, undefined, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="https://example.org/image-filename.png" alt="image filename">')
    })

    it(`should preserve target of ${macroType} image if target is a data URI`, () => {
      const imageData = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
      inputFile.contents = Buffer.from(`image${macroDelim}data:image/gif;base64,${imageData}[dot]`)
      convertDocument(inputFile, undefined, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include(`<img src="data:image/gif;base64,${imageData}" alt="dot">`)
    })

    it(`should resolve target of ${macroType} image from file in topic folder relative to imagesdir`, () => {
      inputFileInTopicFolder.contents = Buffer.from(`image${macroDelim}image-filename.png[]`)
      convertDocument(inputFileInTopicFolder, undefined, asciidocConfig)
      const contents = inputFileInTopicFolder.contents.toString()
      expect(contents).to.include('<img src="../_images/image-filename.png" alt="image filename">')
    })

    it(`should resolve non-URL target of ${macroType} image as resource spec if target contains a colon`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}module-b:image-filename.png[]`)
      const imageFile = {
        path: 'modules/module-b/assets/images/image-filename.png',
        dirname: 'modules/module-b/assets/images',
        src: {
          path: 'modules/module-b/assets/images/image-filename.png',
          dirname: 'modules/module-b/assets/images',
          component: 'component-a',
          version: '1.2.3',
          module: 'module-b',
          family: 'image',
          relative: 'image-filename.png',
        },
        pub: {
          url: '/component-a/1.2.3/module-b/_images/image-filename.png',
        },
      }
      const contentCatalog = { resolveResource: spy(() => imageFile), getComponent: () => {} }
      convertDocument(inputFile, contentCatalog, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="../module-b/_images/image-filename.png" alt="image filename">')
    })

    it(`should resolve non-URL target of ${macroType} image as resource spec if target contains an at sign`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}2.0.0@image-filename.png[]`)
      const imageFile = {
        path: 'modules/module-b/assets/images/image-filename.png',
        dirname: 'modules/module-b/assets/images',
        src: {
          path: 'modules/module-b/assets/images/image-filename.png',
          dirname: 'modules/module-b/assets/images',
          component: 'component-a',
          version: '2.0.0',
          module: 'module-b',
          family: 'image',
          relative: 'image-filename.png',
        },
        pub: {
          url: '/component-a/2.0.0/module-b/_images/image-filename.png',
        },
      }
      const contentCatalog = { resolveResource: spy(() => imageFile), getComponent: () => {} }
      convertDocument(inputFile, contentCatalog, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="../../2.0.0/module-b/_images/image-filename.png" alt="image filename">')
    })

    it(`should use ${macroType} image target if target matches resource ID spec and image cannot be resolved`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}no-such-module:image-filename.png[]`)
      const contentCatalog = { resolveResource: spy(() => undefined), getComponent: () => {} }
      convertDocument(inputFile, contentCatalog, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="no-such-module:image-filename.png" alt="image filename">')
    })

    it(`should use ${macroType} image target if target matches resource ID spec and syntax is invalid`, () => {
      inputFile.contents = Buffer.from(`image${macroDelim}component-b::[]`)
      const contentCatalog = {
        resolveResource: spy(() => {
          throw new Error()
        }),
        getComponent: () => {},
      }
      convertDocument(inputFile, contentCatalog, asciidocConfig)
      const contents = inputFile.contents.toString()
      expect(contents).to.include('<img src="component-b::" alt="">')
    })
  })
})
