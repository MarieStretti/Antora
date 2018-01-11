/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, heredoc } = require('../../../test/test-utils')

const loadAsciiDoc = require('@antora/asciidoc-loader')
const mockContentCatalog = require('../../../test/mock-content-catalog')

describe('loadAsciiDoc()', () => {
  let inputFile

  const expectLink = (html, url, content) => expect(html).to.include(`<a href="${url}">${content}</a>`)
  const expectPageLink = (html, url, content) => expect(html).to.include(`<a href="${url}" class="page">${content}</a>`)

  const setInputFileContents = (contents) => {
    inputFile.contents = Buffer.from(contents)
  }

  beforeEach(() => {
    inputFile = {
      path: 'modules/module-a/pages/page-a.adoc',
      dirname: 'modules/module-a/pages',
      src: {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'page-a.adoc',
        basename: 'page-a.adoc',
        stem: 'page-a',
        extname: '.adoc',
      },
      pub: {
        url: '/component-a/module-a/page-a.html',
        moduleRootPath: '.',
        rootPath: '../..',
      },
    }
  })

  it('should load document model from AsciiDoc contents', () => {
    const contents = heredoc`
      = Document Title

      == Section Title

      paragraph

      * list item 1
      * list item 2
      * list item 3
    `
    setInputFileContents(contents)
    const doc = loadAsciiDoc(inputFile)
    const allBlocks = doc.findBy()
    expect(allBlocks).to.have.lengthOf(8)
  })

  it('should not register Antora enhancements for Asciidoctor globally', () => {
    const contents = heredoc`
      = Document Title

      xref:1.0@component-b::index.adoc[Component B]

      include::does-not-resolve.adoc[]
    `
    const defaultStderrWrite = process.stderr.write
    process.stderr.write = (msg) => {}
    const html = global.Opal.Asciidoctor.convert(contents, { safe: 'safe' })
    expectLink(html, '#1.0@component-b::index.adoc', 'Component B')
    expect(html).to.include('Unresolved directive in &lt;stdin&gt; - include::does-not-resolve.adoc[]')
    process.stderr.write = defaultStderrWrite
  })

  it('should use UTF-8 as the default String encoding', () => {
    expect(String('foo'.encoding)).to.equal('UTF-8')
  })

  it('should return correct bytes for String', () => {
    expect('foo'.$bytesize()).to.equal(3)
    expect('foo'.$each_byte().$to_a()).to.eql([102, 111, 111])
  })

  describe('attributes', () => {
    it('should set correct integration attributes on document', () => {
      setInputFileContents('= Document Title')
      const doc = loadAsciiDoc(inputFile)
      expect(doc.getBaseDir()).to.equal('modules/module-a/pages')
      expect(doc.getAttributes()).to.include({
        // env
        env: 'site',
        'env-site': '',
        'site-gen': 'antora',
        'site-gen-antora': '',
        // default
        'attribute-missing': 'warn',
        icons: 'font',
        sectanchors: '',
        'source-highlighter': 'highlight.js',
        // built-in
        docname: 'page-a',
        docfile: 'modules/module-a/pages/page-a.adoc',
        docdir: doc.getBaseDir(),
        docfilesuffix: '.adoc',
        imagesdir: '_images',
        attachmentsdir: '_attachments',
        partialsdir: 'partial$',
        examplesdir: 'example$',
        // computed
        doctitle: 'Document Title',
        notitle: '',
        embedded: '',
        'safe-mode-name': 'safe',
        'safe-mode-safe': '',
      })
    })

    it('should set correct integration attributes on document for page in topic folder', () => {
      inputFile = mockContentCatalog({
        version: '4.5.6',
        family: 'page',
        relative: 'topic-a/page-a.adoc',
        contents: '= Document Title',
      }).getFiles()[0]
      const doc = loadAsciiDoc(inputFile)
      expect(doc.getAttributes()).to.include({
        imagesdir: '../_images',
        attachmentsdir: '../_attachments',
      })
    })

    it('should add custom attributes to document', () => {
      setInputFileContents('= Document Title')
      const customAttrs = {
        'attribute-missing': 'skip',
        icons: '',
        idseparator: '-',
        'source-highlighter': 'html-pipeline',
      }
      const doc = loadAsciiDoc(inputFile, customAttrs)
      expect(doc.getAttributes()).to.include(customAttrs)
    })

    it('should not fail if custom attributes is null', () => {
      setInputFileContents('= Document Title')
      const doc1 = loadAsciiDoc(inputFile)
      const doc2 = loadAsciiDoc(inputFile, null)
      expect(doc1.getAttributes().length).to.eql(doc2.getAttributes().length)
    })

    it('should not allow custom attributes to override locked attributes', () => {
      setInputFileContents('= Document Title')
      const customAttrs = {
        docname: 'foo',
        docfile: 'foo.asciidoc',
        docfilesuffix: '.asciidoc',
        imagesdir: 'images',
        attachmentsdir: 'attachments',
        examplesdir: 'examples',
        partialsdir: 'partials',
      }
      const doc = loadAsciiDoc(inputFile, customAttrs)
      expect(doc.getAttributes()).not.to.include(customAttrs)
      expect(doc.getAttributes()).to.include({ docfile: 'modules/module-a/pages/page-a.adoc' })
    })
  })

  describe('include directive', () => {
    it('should skip include directive if target cannot be resolved', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      const inputContents = 'include::{partialsdir}/does-not-exist.adoc[]'
      setInputFileContents(inputContents)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'does-not-exist.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql(['+' + inputContents + '+'])
    })

    it('should resolve include target prefixed with {partialsdir}', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::{partialsdir}/greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql([includeContents])
    })

    it('should resolve include target prefixed with {examplesdir}', () => {
      const includeContents = 'puts "Hello, World!"'
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/hello.rb',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/hello.rb[]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'example',
        relative: 'ruby/hello.rb',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.style).to.equal('source')
      expect(firstBlock.$lines()).to.eql([includeContents])
    })

    it('should not apply tag filtering to include contents if tag attribute is empty', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tag=]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n'))
    })

    it('should not apply tag filtering to include contents if tags attribute is empty', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n'))
    })

    it('should not apply tag filtering to include contents if tags attribute has empty values', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=;]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n'))
    })

    it('should apply tag filtering to include contents if tag is specified', () => {
      const includeContents = heredoc`
        # greet example
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tag=hello]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n').filter((l) => l.charAt() !== '#'))
    })

    it('should match tag directives enclosed in circumfix comments', () => {
      const includeContents = heredoc`
        /* tag::header[] */
        header { color: red; }
        /* end::header[] */
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'theme.css',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,css]
        ----
        include::{examplesdir}/theme.css[tag=header]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n').filter((l) => !l.startsWith('/*')))
    })

    it('should apply tag filtering to include contents if negated tag is specified', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tag=!hello]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.be.empty()
    })

    it('should apply tag filtering to include contents if tags are specified', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
        # tag::goodbye[]
        puts "Goodbye, World!"
        # end::goodbye[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=hello;goodbye]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n').filter((l) => l.charAt() !== '#'))
    })

    it('should apply tag filtering to include contents if negated tags are specified', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
        # tag::goodbye[]
        puts "Goodbye, World!"
        # end::goodbye[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=*;!goodbye]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(['puts "Hello, World!"'])
    })

    it('should include nested tags when applying tag filtering to include contents', () => {
      const includeContents = heredoc`
        # tag::decl[]
        msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }
        # end::decl[]
        # tag::output[]
        # tag::hello[]
        puts msgs[:hello]
        # end::hello[]
        # tag::goodbye[]
        puts msgs[:goodbye]
        # end::goodbye[]
        # end::output[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=decl;output;!hello]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql([
        'msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }',
        'puts msgs[:goodbye]',
      ])
    })

    it('should skip redundant tags in include file', () => {
      const includeContents = heredoc`
        puts "Please stand by..."
        # tag::hello[]
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tag=*]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(['puts "Hello, World!"'])
    })

    it('should not select nested tag if outer tag is unselected', () => {
      const includeContents = heredoc`
        puts "Please stand by..."
        # tag::hello[]
        # tag::futile[]
        puts "Hello, World!"
        # end::futile[]
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=*;!hello]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql([])
    })

    // TODO test for warning once logged
    it('should handle mismatched end tag in include file', () => {
      const includeContents = heredoc`
        puts "Please stand by..."
        # tag::hello[]
        puts "Hello, World!"
        # tag::goodbye[]
        # end::hello[]
        puts "Goodbye, World!"
        # end::goodbye[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=hello;goodbye]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(['puts "Hello, World!"', 'puts "Goodbye, World!"'])
    })

    // TODO test for warning once logged
    it('should skip redundant end tag in include file', () => {
      const includeContents = heredoc`
        puts "Please stand by..."
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
        # end::hello[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tag=hello]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(['puts "Hello, World!"'])
    })

    it('should include all lines except for tag directives when tag wildcard is specified', () => {
      const includeContents = heredoc`
        msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }
        # tag::hello[]
        puts msgs[:hello]
        # end::hello[]
        # tag::goodbye[]
        puts msgs[:goodbye]
        # end::goodbye[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=**]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql([
        'msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }',
        'puts msgs[:hello]',
        'puts msgs[:goodbye]',
      ])
    })

    it('should include lines outside of tags if tag wildcard is specified along with specific tags', () => {
      const includeContents = heredoc`
        msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }
        # tag::hello[]
        puts msgs[:hello]
        # end::hello[]
        # tag::goodbye[]
        puts msgs[:goodbye]
        # end::goodbye[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=**;!*;goodbye]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql([
        'msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }',
        'puts msgs[:goodbye]',
      ])
    })

    // TODO if we're going to support includes in nav files, we need a place for them to live?
    it('should resolve top-level include target relative to current file', () => {
      const includeContents = 'changelog'
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'changelog.adoc',
        contents: includeContents,
      }).spyOn('getByPath')
      setInputFileContents('include::changelog.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: 'master',
        path: 'modules/module-a/pages/changelog.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql([includeContents])
    })

    it('should resolve target of nested include relative to current file', () => {
      const outerIncludeContents = 'include::deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          family: 'partial',
          relative: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          family: 'partial',
          relative: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ]).spyOn('getById', 'getByPath')
      setInputFileContents('include::{partialsdir}/outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'outer.adoc',
      })
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: 'master',
        path: 'modules/module-a/pages/_partials/deeply/nested.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql([nestedIncludeContents])
    })

    it('should skip nested include directive if target cannot be resolved relative to current file', () => {
      const outerIncludeContents = 'include::deeply/nested.adoc[]'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'outer.adoc',
        contents: outerIncludeContents,
      }).spyOn('getById', 'getByPath')
      setInputFileContents('include::{partialsdir}/outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'outer.adoc',
      })
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: 'master',
        path: 'modules/module-a/pages/_partials/deeply/nested.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql(['+' + outerIncludeContents + '+'])
    })
  })

  describe('page reference macro', () => {
    it('should skip an invalid page reference', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:component-b::#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#', 'component-b::#frag')
    })

    it('should delegate the built-in converter to process an in-page reference', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:section-a[]\n\n== Section A')
      const html = loadAsciiDoc(inputFile, { idprefix: '', idseparator: '-' }, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#section-a', 'Section A')
    })

    it('should delegate the built-in converter to process a normal link', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('https://example.com[Example Domain]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, 'https://example.com', 'Example Domain')
    })

    it('should skip an unresolved page reference', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b:module-b:topic-foo/topic-bar/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'topic-foo/topic-bar/the-page.adoc',
      })
      expectLink(html, '#', '4.5.6@component-b:module-b:topic-foo/topic-bar/the-page.adoc')
    })

    it('should skip an unresolved page reference with fragment', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b:module-b:topic-foo/topic-bar/the-page.adoc#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'topic-foo/topic-bar/the-page.adoc',
      })
      expectLink(html, '#', '4.5.6@component-b:module-b:topic-foo/topic-bar/the-page.adoc#frag')
    })

    it('should convert a page reference with version, component, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/4.5.6/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a fully-qualified page reference', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'topic-foo/topic-bar/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b:module-b:topic-foo/topic-bar/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'topic-foo/topic-bar/the-page.adoc',
      })
      expectPageLink(
        html,
        inputFile.pub.rootPath + '/component-b/4.5.6/module-b/topic-foo/topic-bar/the-page.html',
        'The Page Title'
      )
    })

    it('should convert a fully-qualified page reference with fragment', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'topic-foo/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b:module-b:topic-foo/the-page.adoc#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'topic-foo/the-page.adoc',
      })
      expectPageLink(
        html,
        inputFile.pub.rootPath + '/component-b/4.5.6/module-b/topic-foo/the-page.html#frag',
        'The Page Title'
      )
    })

    it('should convert a page reference with version, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, '../4.5.6/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, '../4.5.6/module-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, component, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b::the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/4.5.6/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, component, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b::the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/4.5.6/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:component-b::the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:component-b::the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:component-b:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:component-b:module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/module-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, '../4.5.6/module-a/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:4.5.6@the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, '../4.5.6/module-a/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with module and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, '../module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, '../module-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a basic page reference', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, 'the-page.html', 'The Page Title')
    })

    it('should convert a basic page reference from within topic', () => {
      const contentCatalog = mockContentCatalog([
        {
          family: 'page',
          relative: 'the-topic/the-page.adoc',
          contents: 'xref:the-page.adoc[The Page Title]',
        },
        {
          family: 'page',
          relative: 'the-page.adoc',
        },
      ]).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, '../the-page.html', 'The Page Title')
    })

    it('should convert a page reference with topic and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, 'the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with sibling topic and page', () => {
      const contentCatalog = mockContentCatalog([
        {
          family: 'page',
          relative: 'topic-a/the-page.adoc',
          contents: 'xref:topic-b/the-page.adoc[The Page Title]',
        },
        {
          family: 'page',
          relative: 'topic-b/the-page.adoc',
        },
      ]).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'topic-b/the-page.adoc',
      })
      expectPageLink(html, '../topic-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference to self', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:this-page.adoc[Link to Self]',
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectPageLink(html, 'this-page.html', 'Link to Self')
    })

    it('should convert a page reference to a root relative path if relativizePageRefs is disabled', () => {
      const contentCatalog = mockContentCatalog([
        {
          family: 'page',
          relative: 'this-page.adoc',
          contents: 'xref:that-page.adoc[The Page Title]',
        },
        {
          family: 'page',
          relative: 'that-page.adoc',
        },
      ]).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog, { relativizePageRefs: false }).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'that-page.adoc',
      })
      expectPageLink(html, '/component-a/module-a/that-page.html', 'The Page Title')
    })

    it('should convert a page reference with module and page using indexified URLs', () => {
      const contentCatalog = mockContentCatalog([
        {
          family: 'page',
          relative: 'this-page.adoc',
          contents: 'xref:module-b:that-page.adoc[The Page Title]',
          indexify: true,
        },
        {
          module: 'module-b',
          family: 'page',
          relative: 'that-page.adoc',
          indexify: true,
        },
      ]).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'that-page.adoc',
      })
      expectPageLink(html, '../../module-b/that-page/', 'The Page Title')
    })

    it('should convert a page reference with topic and page using indexified URLs', () => {
      const contentCatalog = mockContentCatalog([
        {
          family: 'page',
          relative: 'this-page.adoc',
          contents: 'xref:the-topic/that-page.adoc[The Page Title]',
          indexify: true,
        },
        {
          family: 'page',
          relative: 'the-topic/that-page.adoc',
          indexify: true,
        },
      ]).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-topic/that-page.adoc',
      })
      expectPageLink(html, '../the-topic/that-page/', 'The Page Title')
    })

    it('should convert a basic page reference from within a topic using indexified URLs', () => {
      const contentCatalog = mockContentCatalog([
        {
          family: 'page',
          relative: 'topic-a/this-page.adoc',
          contents: 'xref:that-page.adoc[The Page Title]',
          indexify: true,
        },
        {
          family: 'page',
          relative: 'that-page.adoc',
          indexify: true,
        },
      ]).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'that-page.adoc',
      })
      expectPageLink(html, '../../that-page/', 'The Page Title')
    })

    it('should convert a page reference to self using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:this-page.adoc[Link to Self]',
        indexify: true,
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectPageLink(html, './', 'Link to Self')
    })

    it('should use default content for page reference if content not specified', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:module-b:the-topic/the-page.adoc#frag[]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      // TODO eventually this will resolve to the title of the target page
      expectPageLink(html, '../module-b/the-topic/the-page.html#frag', 'module-b:the-topic/the-page.adoc#frag')
    })
  })
})
