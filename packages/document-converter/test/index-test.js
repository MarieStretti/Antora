/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, heredoc, spy } = require('../../../test/test-utils')

const convertDocument = require('@antora/document-converter')

describe('convertDocument()', () => {
  let inputFile

  const expectLink = (html, url, content) => expect(html).to.include(`<a href="${url}">${content}</a>`)

  beforeEach(() => {
    inputFile = {
      path: 'modules/module-a/pages/page-a.adoc',
      dirname: 'modules/module-a/pages',
      src: {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: '',
        moduleRootPath: '..',
        stem: 'page-a',
        extname: '.adoc',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/page-a.html',
        moduleRootPath: '..',
        rootPath: '../../..',
      },
    }
  })

  it('should convert AsciiDoc contents on file to HTML', () => {
    const inputFileContents = heredoc`
      = Page Title

      == Section Title
      
      Grab the link:{attachmentsdir}/quickstart-project.zip[quickstart project].
      
      * list item 1
      * list item 2
      * list item 3

      image::screenshot.png[]
    `
    inputFile.contents = Buffer.from(inputFileContents)
    expect(convertDocument(inputFile))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.contents.toString()).to.eql(heredoc`
          <div class="sect1">
          <h2 id="_section_title"><a class="anchor" href="#_section_title"></a>Section Title</h2>
          <div class="sectionbody">
          <div class="paragraph">
          <p>Grab the <a href="../_attachments/quickstart-project.zip">quickstart project</a>.</p>
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
          <img src="../_images/screenshot.png" alt="screenshot">
          </div>
          </div>
          </div>
          </div>
        `)
      })
  })

  it('should store document header attributes to file', () => {
    const inputFileContents = heredoc`
      = Document Title
      :keywords: CSS, flexbox, layout, box model

      article contents
    `
    inputFile.contents = Buffer.from(inputFileContents)
    expect(convertDocument(inputFile))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.asciidoc).to.not.be.undefined()
        const attrs = inputFile.asciidoc.attributes
        expect(attrs).to.not.be.undefined()
        expect(attrs).to.include({
          docfile: inputFile.path,
          env: 'site',
          imagesdir: inputFile.pub.moduleRootPath + '/_images',
          keywords: 'CSS, flexbox, layout, box model',
        })
      })
  })

  it('should pass custom attributes to processor', () => {
    const customAttrs = {
      'product-name': 'Hi-Speed Tonic',
      'source-highlighter': 'html-pipeline',
    }
    const inputFileContents = heredoc`
      = Document Title

      Get there in a flash with {product-name}.
    `
    inputFile.contents = Buffer.from(inputFileContents)
    expect(convertDocument(inputFile, customAttrs))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.contents.toString()).to.include(customAttrs['product-name'])
        expect(inputFile.asciidoc).to.not.be.undefined()
        const attrs = inputFile.asciidoc.attributes
        expect(attrs).to.not.be.undefined()
        expect(attrs).to.include(customAttrs)
      })
  })

  it('should convert page reference to URL of page in content catalog', () => {
    const inputFileContents = 'xref:module-b:page-b.adoc[Page B]'
    inputFile.contents = Buffer.from(inputFileContents)
    const targetFile = {
      path: 'modules/module-b/page-b.adoc',
      dirname: 'modules/module-b',
      src: {
        basename: 'page-b.adoc',
      },
      pub: {
        url: '/component-a/1.2.3/module-b/page-b.html',
      },
    }
    const contentCatalog = { getById: spy(() => targetFile) }
    expect(convertDocument(inputFile, {}, contentCatalog))
      .to.be.fulfilled()
      .then(() => {
        expectCalledWith(contentCatalog.getById, {
          component: 'component-a',
          version: '1.2.3',
          module: 'module-b',
          family: 'page',
          subpath: '',
          basename: 'page-b.adoc',
        })
        expectLink(inputFile.contents.toString(), '../module-b/page-b.html', 'Page B')
      })
  })

  it('should resolve include target from content catalog', () => {
    const inputFileContents = 'include::{partialsdir}/definitions.adoc[]'
    inputFile.contents = Buffer.from(inputFileContents)
    const partialFile = {
      path: 'modules/module-a/pages/_partials/definitions.adoc',
      dirname: 'modules/module-a/pages/_partials',
      contents: Buffer.from(`cloud: someone else's computer`),
      src: {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        subpath: '',
        basename: 'definitions.adoc',
      },
    }
    const contentCatalog = { getById: spy(() => partialFile) }
    expect(convertDocument(inputFile, {}, contentCatalog))
      .to.be.fulfilled()
      .then(() => {
        expectCalledWith(contentCatalog.getById, {
          component: 'component-a',
          version: '1.2.3',
          module: 'module-a',
          family: 'partial',
          subpath: '',
          basename: 'definitions.adoc',
        })
        expect(inputFile.contents.toString()).to.include('cloud: someone else&#8217;s computer')
      })
  })
})
