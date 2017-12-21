/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, spy } = require('../../../test/test-utils')

const asciidoctor = require('asciidoctor.js')()
const loadAsciiDoc = require('@antora/asciidoc-loader')
const path = require('path')

describe('loadAsciiDoc()', () => {
  let inputFile

  const expectLink = (html, url, content) => expect(html).to.include(`<a href="${url}">${content}</a>`)

  const heredoc = ([str]) => {
    const lines = str.trimRight().split(/^/m)
    if (lines.length > 1) {
      const firstLine = lines[0]
      if (firstLine === '\n' || firstLine === '\r\n' || firstLine === '\r') {
        lines.shift()
      }
    } else {
      return str
    }

    const indentRx = /^ +/
    const indentLen = Math.min(...lines.filter((l) => l.startsWith(' ')).map((l) => l.match(indentRx)[0].length))
    if (indentLen) {
      return lines.map((l) => (l.startsWith(' ') ? l.substr(indentLen) : l)).join('')
    } else {
      return lines.join('')
    }
  }

  const populateFileContents = (contents) => {
    inputFile.contents = Buffer.from(contents)
  }

  const buildComponentVersionKey = (component, version) =>
    (version || '1.2.3') + '@' + (component || 'component-a') + ':'

  const mockContentCatalog = (seed = []) => {
    if (!Array.isArray(seed)) seed = [seed]
    const familyDirs = {
      page: 'pages',
      partial: 'pages/_partials',
      example: 'examples',
    }
    const entriesById = {}
    const entriesByPath = {}
    seed.forEach(({ family, relativePath, contents, component, version, module, indexify }) => {
      if (!component) component = 'component-a'
      if (!version) version = '1.2.3'
      if (!module) module = 'module-a'
      if (!contents) contents = '= Page Title\n\npage contents'
      const componentVersionKey = buildComponentVersionKey(component, version)
      const componentRelativePath = path.join('modules', module, familyDirs[family], relativePath)
      const entry = {
        path: componentRelativePath,
        dirname: path.dirname(componentRelativePath),
        contents: Buffer.from(contents),
        src: {
          basename: path.basename(relativePath),
        },
      }
      if (family === 'page') {
        const pubVersion = version === 'master' ? '' : version
        const pubModule = module === 'ROOT' ? '' : module
        const pubRelativePath = relativePath.slice(0, -5) + (indexify ? '/' : '.html')
        entry.pub = { url: path.join('/', component, pubVersion, pubModule, pubRelativePath) }
      }
      const byIdKey = componentVersionKey + family + '$' + relativePath
      const byPathKey = componentVersionKey + componentRelativePath
      entriesById[byIdKey] = entriesByPath[byPathKey] = entry
    })

    return {
      getById: spy(
        ({ component, version, family, subpath, basename }) =>
          entriesById[buildComponentVersionKey(component, version) + family + '$' + path.join(subpath, basename)]
      ),
      getByPath: spy(
        ({ path: path_, component, version }) => entriesByPath[buildComponentVersionKey(component, version) + path_]
      ),
    }
  }

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

  it('should load document model from AsciiDoc contents', () => {
    const contents = heredoc`
      = Document Title

      == Section Title

      paragraph

      * list item 1
      * list item 2
      * list item 3
    `
    populateFileContents(contents)
    const doc = loadAsciiDoc(inputFile)
    const allBlocks = doc.findBy()
    expect(allBlocks).to.have.lengthOf(8)
  })

  it('should not register Antora enhancements to Asciidoctor globally', () => {
    const contents = heredoc`
      = Document Title

      xref:1.0@component-b::index.adoc[Component B]

      include::does-not-resolve.adoc[]
    `
    const defaultStderrWrite = process.stderr.write
    process.stderr.write = (msg) => {}
    const html = asciidoctor.convert(contents, { safe: 'safe' })
    expectLink(html, '#1.0@component-b::index.adoc', 'Component B')
    expect(html).to.include('Unresolved directive in &lt;stdin&gt; - include::does-not-resolve.adoc[]')
    process.stderr.write = defaultStderrWrite
  })

  describe('attributes', () => {
    it('should set correct integration attributes on document', () => {
      populateFileContents('= Document Title')
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
        imagesdir: '../_images',
        attachmentsdir: '../_attachments',
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

    it('should add custom attributes to document', () => {
      populateFileContents('= Document Title')
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
      populateFileContents('= Document Title')
      const doc1 = loadAsciiDoc(inputFile)
      const doc2 = loadAsciiDoc(inputFile, null)
      expect(doc1.getAttributes().length).to.eql(doc2.getAttributes().length)
    })

    it('should not allow custom attributes to override locked attributes', () => {
      populateFileContents('= Document Title')
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
      const contentCatalog = mockContentCatalog()
      const inputContents = 'include::{partialsdir}/does-not-exist.adoc[]'
      populateFileContents(inputContents)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        subpath: '',
        basename: 'does-not-exist.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql(['+' + inputContents + '+'])
    })

    it('should read include target prefixed with {partialsdir}', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relativePath: 'greeting.adoc',
        contents: includeContents,
      })
      populateFileContents('include::{partialsdir}/greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        subpath: '',
        basename: 'greeting.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql([includeContents])
    })

    it('should read include target prefixed with {examplesdir}', () => {
      const includeContents = 'puts "Hello, World!"'
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relativePath: 'ruby/hello.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/hello.rb[]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'example',
        subpath: 'ruby',
        basename: 'hello.rb',
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tag=hello]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n').filter((l) => !l.startsWith('#')))
    })

    it('should match tag directives enclosed in circumfix comments', () => {
      const includeContents = heredoc`
        /* tag::header[] */
        header { color: red; }
        /* end::header[] */
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relativePath: 'theme.css',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=hello;goodbye]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('listing')
      expect(firstBlock.$lines()).to.eql(includeContents.split('\n').filter((l) => !l.startsWith('#')))
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
        relativePath: 'ruby/greet.rb',
        contents: includeContents,
      })
      populateFileContents(heredoc`
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
    // TODO this test will be affected if we decide to set docdir attribute on document
    it('should read top-level include target relative to current file', () => {
      const includeContents = 'changelog'
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relativePath: 'changelog.adoc',
        contents: includeContents,
      })
      populateFileContents('include::changelog.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: '1.2.3',
        path: 'modules/module-a/pages/changelog.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql([includeContents])
    })

    it('should read target of nested include relative to current file', () => {
      const outerIncludeContents = 'include::deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          family: 'partial',
          relativePath: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          family: 'partial',
          relativePath: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ])
      populateFileContents('include::{partialsdir}/outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        subpath: '',
        basename: 'outer.adoc',
      })
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: '1.2.3',
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
        relativePath: 'outer.adoc',
        contents: outerIncludeContents,
      })
      populateFileContents('include::{partialsdir}/outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, {}, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        subpath: '',
        basename: 'outer.adoc',
      })
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: '1.2.3',
        path: 'modules/module-a/pages/_partials/deeply/nested.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.context).to.equal('paragraph')
      expect(firstBlock.$lines()).to.eql(['+' + outerIncludeContents + '+'])
    })
  })

  describe('page reference macro', () => {
    const indexifyFile = () => {
      inputFile.pub = {
        url: inputFile.pub.url.slice(0, -5) + '/',
        rootPath: inputFile.pub.rootPath + '/..',
      }
    }

    const moveFileIntoTopic = (topic) => {
      const search = '/page-a.'
      const replace = `/${topic}/page-a.`
      inputFile.path = inputFile.path.replace(search, replace)
      inputFile.src.subpath = topic
      inputFile.pub.moduleRootPath += '/..'
      inputFile.pub.url = inputFile.pub.url.replace(search, replace)
      inputFile.pub.rootPath += '/..'
    }

    it('should skip an invalid page reference', () => {
      const contentCatalog = mockContentCatalog()
      populateFileContents('xref:component-b::#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#', 'component-b::#frag')
    })

    it('should delegate the built-in converter to process an in-page reference', () => {
      const contentCatalog = mockContentCatalog()
      populateFileContents('xref:section-a[]\n\n== Section A')
      const html = loadAsciiDoc(inputFile, { idprefix: '', idseparator: '-' }, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#section-a', 'Section A')
    })

    it('should delegate the built-in converter to process a normal link', () => {
      const contentCatalog = mockContentCatalog()
      populateFileContents('https://example.com[Example Domain]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, 'https://example.com', 'Example Domain')
    })

    it('should skip an unresolved page reference', () => {
      const contentCatalog = mockContentCatalog()
      populateFileContents('xref:4.5.6@component-b:module-b:subpath-foo/subpath-bar/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: 'subpath-foo/subpath-bar',
        basename: 'the-page.adoc',
      })
      expectLink(html, '#', '4.5.6@component-b:module-b:subpath-foo/subpath-bar/the-page.adoc')
    })

    it('should skip an unresolved page reference with fragment', () => {
      const contentCatalog = mockContentCatalog()
      populateFileContents('xref:4.5.6@component-b:module-b:subpath-foo/subpath-bar/the-page.adoc#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: 'subpath-foo/subpath-bar',
        basename: 'the-page.adoc',
      })
      expectLink(html, '#', '4.5.6@component-b:module-b:subpath-foo/subpath-bar/the-page.adoc#frag')
    })

    it('should convert a page reference with version, component, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:4.5.6@component-b:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/4.5.6/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a fully-qualified page reference', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relativePath: 'subpath-foo/subpath-bar/the-page.adoc',
      })
      populateFileContents('xref:4.5.6@component-b:module-b:subpath-foo/subpath-bar/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: 'subpath-foo/subpath-bar',
        basename: 'the-page.adoc',
      })
      expectLink(
        html,
        inputFile.pub.rootPath + '/component-b/4.5.6/module-b/subpath-foo/subpath-bar/the-page.html',
        'The Page Title'
      )
    })

    it('should convert a fully-qualified page reference with fragment', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relativePath: 'subpath-foo/the-page.adoc',
      })
      populateFileContents('xref:4.5.6@component-b:module-b:subpath-foo/the-page.adoc#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: 'subpath-foo',
        basename: 'the-page.adoc',
      })
      expectLink(
        html,
        inputFile.pub.rootPath + '/component-b/4.5.6/module-b/subpath-foo/the-page.html#frag',
        'The Page Title'
      )
    })

    it('should convert a page reference with version, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:4.5.6@module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../../4.5.6/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:4.5.6@module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-b',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../../4.5.6/module-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, component, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:4.5.6@component-b::the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/4.5.6/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, component, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:4.5.6@component-b::the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '4.5.6',
        module: 'ROOT',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/4.5.6/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:component-b::the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:component-b::the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'ROOT',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:component-b:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:component-b:module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, inputFile.pub.rootPath + '/component-b/module-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:4.5.6@the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../../4.5.6/module-a/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with version, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:4.5.6@the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '4.5.6',
        module: 'module-a',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../../4.5.6/module-a/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with module and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../module-b/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a basic page reference', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      populateFileContents('xref:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, 'the-page.html', 'The Page Title')
    })

    it('should convert a basic page reference from within topic', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-page.adoc',
      })
      moveFileIntoTopic('topic-a')
      populateFileContents('xref:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../the-page.html', 'The Page Title')
    })

    it('should convert a page reference with topic and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, 'the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with sibling topic and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      moveFileIntoTopic('topic-a')
      populateFileContents('xref:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with module and page using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-page.adoc',
        indexify: true,
      })
      indexifyFile()
      populateFileContents('xref:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../../module-b/the-page/', 'The Page Title')
    })

    it('should convert a page reference with topic and page using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
        indexify: true,
      })
      indexifyFile()
      populateFileContents('xref:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../the-topic/the-page/', 'The Page Title')
    })

    it('should convert a basic page reference from within a topic using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relativePath: 'the-page.adoc',
        indexify: true,
      })
      moveFileIntoTopic('topic-a')
      indexifyFile()
      populateFileContents('xref:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        subpath: '',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../../the-page/', 'The Page Title')
    })

    // TODO eventually this will be the title of the target page
    it('should use default content for page reference if content not specified', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        relativePath: 'the-topic/the-page.adoc',
      })
      populateFileContents('xref:module-b:the-topic/the-page.adoc#frag[]')
      const html = loadAsciiDoc(inputFile, {}, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: '1.2.3',
        module: 'module-b',
        family: 'page',
        subpath: 'the-topic',
        basename: 'the-page.adoc',
      })
      expectLink(html, '../module-b/the-topic/the-page.html#frag', 'module-b:the-topic/the-page.adoc#frag')
    })
  })
})
