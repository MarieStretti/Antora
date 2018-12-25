/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, heredoc } = require('../../../test/test-utils')

const loadAsciiDoc = require('@antora/asciidoc-loader')
const { resolveConfig } = loadAsciiDoc
const mockContentCatalog = require('../../../test/mock-content-catalog')
const ospath = require('path')

const Asciidoctor = global.Opal.Asciidoctor

const FIXTURES_DIR = ospath.join(__dirname, 'fixtures')

describe('loadAsciiDoc()', () => {
  let inputFile

  const expectLink = (html, url, content) => expect(html).to.include(`<a href="${url}">${content}</a>`)
  const expectPageLink = (html, url, content) => expect(html).to.include(`<a href="${url}" class="page">${content}</a>`)

  const setInputFileContents = (contents) => {
    inputFile.contents = Buffer.from(contents)
  }

  const captureStderr = (block) => {
    const messages = []
    const defaultStderrWrite = process.stderr.write
    process.stderr.write = (msg) => messages.push(msg)
    const returnVal = block()
    process.stderr.write = defaultStderrWrite
    return [returnVal, messages]
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

  it('should not hang on mismatched passthrough syntax', () => {
    const contents = 'Link the system library `+libconfig++.so.9+` located at `+/usr/lib64/libconfig++.so.9+`.'
    const html = Asciidoctor.convert(contents, { safe: 'safe' })
    expect(html).to.include('+')
  })

  it('should not register Antora enhancements for Asciidoctor globally', () => {
    const contents = heredoc`
      = Document Title

      xref:1.0@component-b::index.adoc[Component B]

      include::does-not-resolve.adoc[]
    `
    const [html, messages] = captureStderr(() => Asciidoctor.convert(contents, { safe: 'safe' }))
    expectLink(html, '1.0@component-b::index.html', 'Component B')
    expect(html).to.include('Unresolved directive in &lt;stdin&gt; - include::does-not-resolve.adoc[]')
    expect(messages).to.have.lengthOf(1)
    expect(messages[0]).to.include('line 5: include file not found')
  })

  it('should use UTF-8 as the default String encoding', () => {
    expect(String('foo'.encoding)).to.equal('UTF-8')
  })

  it('should return correct bytes for String', () => {
    expect('foo'.$bytesize()).to.equal(3)
    expect('foo'.$each_byte().$to_a()).to.eql([102, 111, 111])
  })

  describe('attributes', () => {
    it('should assign built-in and Antora integration attributes on document', () => {
      setInputFileContents('= Document Title')
      const doc = loadAsciiDoc(inputFile, undefined, resolveConfig())
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
        // intrinsic
        docname: 'page-a',
        docfile: 'modules/module-a/pages/page-a.adoc',
        docdir: doc.getBaseDir(),
        docfilesuffix: '.adoc',
        imagesdir: '_images',
        attachmentsdir: '_attachments',
        partialsdir: 'partial$',
        examplesdir: 'example$',
        // page
        'page-component-name': 'component-a',
        'page-component-version': 'master',
        'page-version': 'master',
        'page-module': 'module-a',
        'page-relative': 'page-a.adoc',
        // computed
        doctitle: 'Document Title',
        notitle: '',
        embedded: '',
        'safe-mode-name': 'safe',
        'safe-mode-safe': '',
      })
    })

    it('should assign Antora integration attributes on document for page in topic folder', () => {
      inputFile = mockContentCatalog({
        version: '4.5.6',
        family: 'page',
        relative: 'topic-a/page-a.adoc',
        contents: '= Document Title',
      }).getFiles()[0]
      const doc = loadAsciiDoc(inputFile, undefined, resolveConfig())
      expect(doc.getAttributes()).to.include({
        imagesdir: '../_images',
        attachmentsdir: '../_attachments',
      })
    })

    it('should not set page attributes if file is not in page family', () => {
      const inputFile = mockContentCatalog({
        version: '4.5',
        family: 'nav',
        relative: 'nav.adoc',
        contents: '* xref:module-a:index.adoc[Module A]',
      }).getFiles()[0]
      const doc = loadAsciiDoc(inputFile)
      expect(doc.getAttributes()).to.not.have.any.keys(
        ...['page-component-name', 'page-component-version', 'page-version', 'page-module', 'page-relative']
      )
    })

    it('should set page component title if component is found in content catalog', () => {
      const contentCatalog = mockContentCatalog({
        version: '4.5',
        family: 'page',
        relative: 'page-a.adoc',
        contents: '= Document Title',
      })
      contentCatalog.getComponent('component-a').title = 'Component A'
      const inputFile = contentCatalog.getFiles()[0]
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expect(doc.getAttributes()).to.include({
        'page-component-name': 'component-a',
        'page-component-title': 'Component A',
      })
    })

    it('should set page origin attributes if origin information is available for file from branch', () => {
      const contentCatalog = mockContentCatalog({
        version: '4.5.x',
        family: 'page',
        relative: 'page-a.adoc',
        contents: '= Document Title',
      })
      const inputFileFromBranch = contentCatalog.getFiles()[0]
      inputFileFromBranch.src.origin = {
        type: 'git',
        url: 'https://example.org/component-a.git',
        startPath: 'docs',
        branch: 'v4.5.x',
        worktree: true,
      }
      const docFromBranch = loadAsciiDoc(inputFileFromBranch, contentCatalog)
      expect(docFromBranch.getAttributes()).to.include({
        'page-origin-type': 'git',
        'page-origin-url': 'https://example.org/component-a.git',
        'page-origin-start-path': 'docs',
        'page-origin-branch': 'v4.5.x',
        'page-origin-refname': 'v4.5.x',
        'page-origin-reftype': 'branch',
        'page-origin-worktree': '',
      })
    })

    it('should set page origin attributes if origin information is available for file from tag', () => {
      const contentCatalog = mockContentCatalog({
        version: '4.5.x',
        family: 'page',
        relative: 'page-a.adoc',
        contents: '= Document Title',
      })
      const inputFileFromTag = contentCatalog.getFiles()[0]
      inputFileFromTag.src.origin = {
        type: 'git',
        url: 'https://example.org/component-a.git',
        startPath: '',
        tag: 'v4.5.1',
      }
      const docFromTag = loadAsciiDoc(inputFileFromTag, contentCatalog)
      expect(docFromTag.getAttributes()).to.include({
        'page-origin-type': 'git',
        'page-origin-url': 'https://example.org/component-a.git',
        'page-origin-start-path': '',
        'page-origin-tag': 'v4.5.1',
        'page-origin-refname': 'v4.5.1',
        'page-origin-reftype': 'tag',
      })
    })

    it('should add custom attributes to document', () => {
      setInputFileContents('= Document Title')
      const config = {
        attributes: {
          'attribute-missing': 'skip',
          icons: '',
          idseparator: '-',
          'source-highlighter': 'html-pipeline',
        },
      }
      const doc = loadAsciiDoc(inputFile, undefined, config)
      expect(doc.getAttributes()).to.include(config.attributes)
    })

    it('should allow doctype option to be set on document', () => {
      setInputFileContents('contents')
      const config = { doctype: 'book' }
      const doc = loadAsciiDoc(inputFile, undefined, config)
      expect(doc.getDoctype()).to.equal('book')
      expect(doc.getBlocks()).to.have.lengthOf(1)
      expect(doc.getBlocks()[0].getContext()).to.equal('preamble')
    })

    it('should assign site-url attribute if site url is set in playbook', () => {
      setInputFileContents('= Document Title')
      const playbook = {
        site: {
          url: 'https://docs.example.org',
        },
        asciidoc: {
          attributes: {
            'attribute-missing': 'skip',
            icons: '',
            idseparator: '-',
            'source-highlighter': 'html-pipeline',
          },
        },
      }
      const doc = loadAsciiDoc(inputFile, undefined, resolveConfig(playbook))
      const expectedAttributes = { ...playbook.asciidoc.attributes, 'site-url': 'https://docs.example.org' }
      expect(doc.getAttributes()).to.include(expectedAttributes)
    })

    it('should assign site-title attribute if site title is set in playbook', () => {
      setInputFileContents('= Document Title')
      const playbook = {
        site: {
          title: 'Docs',
        },
        asciidoc: {
          attributes: {
            'attribute-missing': 'skip',
            icons: '',
            idseparator: '-',
            'source-highlighter': 'html-pipeline',
          },
        },
      }
      const doc = loadAsciiDoc(inputFile, undefined, resolveConfig(playbook))
      const expectedAttributes = { ...playbook.asciidoc.attributes, 'site-title': 'Docs' }
      expect(doc.getAttributes()).to.include(expectedAttributes)
    })

    it('should not allow custom attributes to override intrinsic attributes', () => {
      setInputFileContents('= Document Title')
      const config = {
        attributes: {
          docname: 'foo',
          docfile: 'foo.asciidoc',
          docfilesuffix: '.asciidoc',
          imagesdir: 'images',
          attachmentsdir: 'attachments',
          examplesdir: 'examples',
          partialsdir: 'partials',
        },
      }
      const doc = loadAsciiDoc(inputFile, undefined, config)
      expect(doc.getAttributes()).not.to.include(config.attributes)
      expect(doc.getAttributes()).to.include({ docfile: 'modules/module-a/pages/page-a.adoc' })
    })
  })

  describe('extensions', () => {
    it('should not fail if custom extensions are null', () => {
      setInputFileContents('= Document Title')
      const doc = loadAsciiDoc(inputFile, undefined, { extensions: null })
      expect(doc.getDocumentTitle()).equals('Document Title')
    })

    it('should call custom extension to self-register with extension registry per instance', () => {
      const contents = heredoc`
        [shout]
        Release early. Release often.
      `
      setInputFileContents(contents)
      const shoutBlockExtension = function () {
        this.onContext('paragraph')
        this.process((parent, reader) =>
          this.createBlock(parent, 'paragraph', reader.getLines().map((l) => l.toUpperCase()))
        )
      }
      shoutBlockExtension.registered = 0
      shoutBlockExtension.register = (registry) => {
        shoutBlockExtension.registered += 1
        registry.block('shout', shoutBlockExtension)
      }
      const config = { extensions: [shoutBlockExtension] }
      let html

      html = loadAsciiDoc(inputFile, undefined, config).convert()
      expect(shoutBlockExtension.registered).to.equal(1)
      expect(html).to.include('RELEASE EARLY. RELEASE OFTEN')

      html = loadAsciiDoc(inputFile, undefined, config).convert()
      expect(shoutBlockExtension.registered).to.equal(2)
      expect(html).to.include('RELEASE EARLY. RELEASE OFTEN')

      let messages
      ;[html, messages] = captureStderr(() => loadAsciiDoc(inputFile).convert())
      expect(html).to.include('Release early. Release often.')
      expect(messages).to.have.lengthOf(1)
      expect(messages[0]).to.include('page-a.adoc: line 2: invalid style for paragraph: shout')
    })

    it('should give extension access to context that includes current file and content catalog', () => {
      setInputFileContents('files::[]')
      const contentCatalog = mockContentCatalog([
        { family: 'page', relative: 'page-a.adoc' },
        { family: 'page', relative: 'page-b.adoc' },
        { family: 'page', relative: 'page-c.adoc' },
      ])
      const config = { extensions: [require(ospath.resolve(FIXTURES_DIR, 'ext/file-report-block-macro.js'))] }
      const html = loadAsciiDoc(inputFile, contentCatalog, config).convert()
      expect(html).to.include('Files in catalog: 3')
      expect(html).to.include('URL of current page: /component-a/module-a/page-a.html')
    })
  })

  describe('include directive', () => {
    it('should skip include directive if target prefixed with {partialsdir} cannot be resolved', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      const inputContents = 'include::{partialsdir}/does-not-exist.adoc[]'
      setInputFileContents(inputContents)
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      expect(contentCatalog.getById).to.have.been.called.with({
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'does-not-exist.adoc',
      })
      expect(messages).to.have.lengthOf(1)
      // NOTE known issue that cursor is off by one line in custom include processor
      expect(messages[0]).to.include('page-a.adoc: line 2: include target not found: partial$/does-not-exist.adoc')
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      const expectedSource = [
        'Unresolved include directive in modules/module-a/pages/page-a.adoc',
        'include::partial$/does-not-exist.adoc[]',
      ].join(' - ')
      expect(firstBlock.getSourceLines()).to.eql([expectedSource])
    })

    it('should skip include directive if target resource ID cannot be resolved', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      const inputContents = 'include::partial$does-not-exist.adoc[]'
      setInputFileContents(inputContents)
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'does-not-exist.adoc',
      })
      expect(messages).to.have.lengthOf(1)
      // NOTE known issue that cursor is off by one line in custom include processor
      expect(messages[0]).to.include('page-a.adoc: line 2: include target not found: partial$does-not-exist.adoc')
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      const expectedSource = [
        'Unresolved include directive in modules/module-a/pages/page-a.adoc',
        'include::partial$does-not-exist.adoc[]',
      ].join(' - ')
      expect(firstBlock.getSourceLines()).to.eql([expectedSource])
    })

    it('should resolve include target prefixed with {partialsdir}', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::{partialsdir}/greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
    })

    it('should resolve include target with resource ID in partial family', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::partial$greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'example',
        relative: 'ruby/hello.rb',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getStyle()).to.equal('source')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
    })

    it('should resolve include target with resource ID in example family', () => {
      const includeContents = 'puts "Hello, World!"'
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/hello.rb',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::example$ruby/hello.rb[]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'example',
        relative: 'ruby/hello.rb',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getStyle()).to.equal('source')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
    })

    it('should resolve include target with resource ID in separate module', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        module: 'another-module',
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::another-module:partial$greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'another-module',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
    })

    it('should resolve include target with resource ID in separate component', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        component: 'another-component',
        version: '1.1',
        module: 'ROOT',
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::1.1@another-component::partial$greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'another-component',
        version: '1.1',
        module: 'ROOT',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
    })

    it('should assume family of target is partial when target is resource ID in separate component', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        component: 'another-component',
        version: '1.1',
        module: 'ROOT',
        family: 'page',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('resolveResource')
      setInputFileContents('include::1.1@another-component::greeting.adoc[]')
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      expect(contentCatalog.resolveResource).to.not.have.been.called()
      expect(messages).to.have.lengthOf(1)
      // NOTE known issue that cursor is off by one line in custom include processor
      expect(messages[0]).to.include('line 2: include target not found: 1.1@another-component::greeting.adoc')
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      const expectedSource = [
        'Unresolved include directive in modules/module-a/pages/page-a.adoc',
        'include::1.1@another-component::greeting.adoc[]',
      ].join(' - ')
      expect(firstBlock.getSourceLines()).to.eql([expectedSource])
    })

    it('should assume family of target is partial when target is resource ID in separate version', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        version: '1.1',
        family: 'page',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('resolveResource')
      setInputFileContents('include::1.1@greeting.adoc[]')
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      expect(contentCatalog.resolveResource).to.not.have.been.called()
      expect(messages).to.have.lengthOf(1)
      // NOTE known issue that cursor is off by one line in custom include processor
      expect(messages[0]).to.include('line 2: include target not found: 1.1@greeting.adoc')
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      const expectedSource = [
        'Unresolved include directive in modules/module-a/pages/page-a.adoc',
        'include::1.1@greeting.adoc[]',
      ].join(' - ')
      expect(firstBlock.getSourceLines()).to.eql([expectedSource])
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
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
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([nestedIncludeContents])
    })

    it('should skip nested include directive if target cannot be resolved relative to current file', () => {
      const outerIncludeContents = 'include::deeply/nested.adoc[]'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'outer.adoc',
        contents: outerIncludeContents,
      }).spyOn('getById', 'getByPath')
      setInputFileContents('include::{partialsdir}/outer.adoc[]')
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
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
      expect(messages).to.have.lengthOf(1)
      // NOTE known issue that cursor is off by one line in custom include processor
      expect(messages[0]).to.include('outer.adoc: line 2: include target not found: deeply/nested.adoc')
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      const expectedSource = [
        'Unresolved include directive in modules/module-a/pages/_partials/outer.adoc',
        'include::deeply/nested.adoc[]',
      ].join(' - ')
      expect(firstBlock.getSourceLines()).to.eql([expectedSource])
    })

    it('should resolve relative target of nested include in separate module relative to current file', () => {
      const outerIncludeContents = 'include::deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          module: 'other-module',
          family: 'partial',
          relative: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          module: 'other-module',
          family: 'partial',
          relative: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ]).spyOn('resolveResource', 'getByPath')
      setInputFileContents('include::other-module:partial$outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.resolveResource, [
        'other-module:partial$outer.adoc',
        {
          component: inputFile.src.component,
          version: inputFile.src.version,
          module: inputFile.src.module,
          family: 'page',
          relative: 'page-a.adoc',
        },
      ])
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: 'master',
        path: 'modules/other-module/pages/_partials/deeply/nested.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([nestedIncludeContents])
    })

    it('should resolve target resource ID of nested include in separate module relative to current file', () => {
      const outerIncludeContents = 'include::yet-another-module:partial$deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          module: 'other-module',
          family: 'partial',
          relative: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          module: 'yet-another-module',
          family: 'partial',
          relative: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ]).spyOn('resolveResource')
      setInputFileContents('include::other-module:partial$outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expect(contentCatalog.resolveResource).to.have.been.called.twice()
      expectCalledWith(contentCatalog.resolveResource, [
        'other-module:partial$outer.adoc',
        {
          component: inputFile.src.component,
          version: inputFile.src.version,
          module: inputFile.src.module,
          family: 'page',
          relative: 'page-a.adoc',
        },
      ])
      expectCalledWith(
        contentCatalog.resolveResource,
        [
          'yet-another-module:partial$deeply/nested.adoc',
          {
            component: 'component-a',
            version: 'master',
            module: 'other-module',
            family: 'partial',
            relative: 'outer.adoc',
          },
        ],
        1
      )
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([nestedIncludeContents])
    })

    it('should resolve relative target of nested include in separate component relative to current file', () => {
      const outerIncludeContents = 'include::deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          component: 'component-b',
          module: 'ROOT',
          family: 'partial',
          relative: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          component: 'component-b',
          module: 'ROOT',
          family: 'partial',
          relative: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ]).spyOn('resolveResource', 'getByPath')
      setInputFileContents('include::component-b::partial$outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.resolveResource, [
        'component-b::partial$outer.adoc',
        {
          component: inputFile.src.component,
          version: inputFile.src.version,
          module: inputFile.src.module,
          family: 'page',
          relative: 'page-a.adoc',
        },
      ])
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-b',
        version: 'master',
        path: 'modules/ROOT/pages/_partials/deeply/nested.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([nestedIncludeContents])
    })

    it('should resolve target resource ID of nested include from other component relative to file context', () => {
      const outerIncludeContents = 'include::another-module:partial$deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          component: 'component-b',
          module: 'ROOT',
          family: 'partial',
          relative: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          component: 'component-b',
          module: 'another-module',
          family: 'partial',
          relative: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ]).spyOn('resolveResource')
      setInputFileContents('include::component-b::partial$outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expect(contentCatalog.resolveResource).to.have.been.called.twice()
      expectCalledWith(
        contentCatalog.resolveResource,
        [
          'component-b::partial$outer.adoc',
          {
            component: inputFile.src.component,
            version: inputFile.src.version,
            module: inputFile.src.module,
            family: 'page',
            relative: 'page-a.adoc',
          },
        ],
        0
      )
      expectCalledWith(
        contentCatalog.resolveResource,
        [
          'another-module:partial$deeply/nested.adoc',
          {
            component: 'component-b',
            version: 'master',
            module: 'ROOT',
            family: 'partial',
            relative: 'outer.adoc',
          },
        ],
        1
      )
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([nestedIncludeContents])
    })

    it('should ignore current context when resolving nested include if target is qualified resource ID', () => {
      const outerIncludeContents = 'include::component-a:module-a:partial$deeply/nested.adoc[]'
      const nestedIncludeContents = 'All that is nested is not lost.'
      const contentCatalog = mockContentCatalog([
        {
          component: 'component-b',
          module: 'ROOT',
          family: 'partial',
          relative: 'outer.adoc',
          contents: outerIncludeContents,
        },
        {
          family: 'partial',
          relative: 'deeply/nested.adoc',
          contents: nestedIncludeContents,
        },
      ]).spyOn('resolveResource')
      setInputFileContents('include::component-b::partial$outer.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expect(contentCatalog.resolveResource).to.have.been.called.twice()
      expectCalledWith(
        contentCatalog.resolveResource,
        [
          'component-b::partial$outer.adoc',
          {
            component: inputFile.src.component,
            version: inputFile.src.version,
            module: inputFile.src.module,
            family: 'page',
            relative: 'page-a.adoc',
          },
        ],
        0
      )
      expectCalledWith(
        contentCatalog.resolveResource,
        [
          'component-a:module-a:partial$deeply/nested.adoc',
          {
            component: 'component-b',
            version: 'master',
            module: 'ROOT',
            family: 'partial',
            relative: 'outer.adoc',
          },
        ],
        1
      )
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([nestedIncludeContents])
    })

    it('should skip include directive if max include depth is 0', () => {
      const includeContents = 'greetings!'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::partial$greeting.adoc[]')
      const [doc, messages] = captureStderr(() =>
        loadAsciiDoc(inputFile, contentCatalog, { attributes: { 'max-include-depth': 0 } })
      )
      expect(contentCatalog.getById).to.not.have.been.called()
      expect(doc.getBlocks()).to.be.empty()
      expect(messages).to.be.empty()
    })

    it('should skip include directive if max include depth is exceeded', () => {
      const includeContents = 'greetings!\n\ninclude::partial$greeting.adoc[]'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::partial$greeting.adoc[]')
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      const maxIncludeDepth = doc.getAttribute('max-include-depth')
      expect(doc.getBlocks()).to.have.lengthOf(maxIncludeDepth)
      expect(messages).to.have.lengthOf(1)
      expect(messages[0].trim()).to.equal(
        `asciidoctor: ERROR: greeting.adoc: line 4: maximum include depth of ${maxIncludeDepth} exceeded`
      )
    })

    it('should honor depth set in include directive', () => {
      const includeContents = 'greetings!\n\ninclude::partial$hit-up-for-money.adoc[]'
      const contentCatalog = mockContentCatalog([
        { family: 'partial', relative: 'greeting.adoc', contents: includeContents },
        { family: 'partial', relative: 'hit-up-for-money.adoc', contents: 'Got some coin for me?' },
      ]).spyOn('getById')
      setInputFileContents('include::partial$greeting.adoc[depth=0]')
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      expect(contentCatalog.getById).to.have.been.called.once()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      expect(doc.getBlocks()).to.have.lengthOf(1)
      expect(messages).to.have.lengthOf(1)
      expect(messages[0].trim()).to.equal(
        `asciidoctor: ERROR: greeting.adoc: line 4: maximum include depth of 1 exceeded`
      )
    })

    it('should not register include in document catalog', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog({
        family: 'partial',
        relative: 'greeting.adoc',
        contents: includeContents,
      }).spyOn('getById')
      setInputFileContents('include::{partialsdir}/greeting.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'partial',
        relative: 'greeting.adoc',
      })
      expect(doc.getCatalog().includes['$key?']('greeting')).to.be.true()
      expect(doc.getCatalog().includes['$[]']('greeting')).to.equal(global.Opal.nil)
    })

    it('should not mangle a page reference if reference matches rootname of include', () => {
      const includeContents = 'Hello, World!'
      const contentCatalog = mockContentCatalog([
        {
          family: 'partial',
          relative: 'greeting.adoc',
          contents: includeContents,
        },
        {
          family: 'page',
          relative: 'greeting.adoc',
        },
      ]).spyOn('getById')
      setInputFileContents('include::{partialsdir}/greeting.adoc[]\n\nsee xref:greeting.adoc#message[greeting message]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expect(doc.convert()).to.include('<a href="greeting.html#message"')
    })

    it('should not apply tag filtering to contents of include if tag attribute is empty', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n'))
    })

    it('should not apply tag filtering to contents of include if tags attribute is empty', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n'))
    })

    it('should not apply tag filtering to contents of include if tags attribute has empty values', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n'))
    })

    it('should apply tag filtering to contents of include if tag is specified', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n').filter((l) => l.charAt() !== '#'))
    })

    it('should match tag directives enclosed in circumfix comments', () => {
      const cssContents = heredoc`
        /* tag::snippet[] */
        header { color: red; }
        /* end::snippet[] */
      `
      const mlContents = heredoc`
        (* tag::snippet[] *)
        let s = SS.empty;;
        (* end::snippet[] *)
      `
      const contentCatalog = mockContentCatalog([
        { family: 'example', relative: 'theme.css', contents: cssContents },
        { family: 'example', relative: 'empty.ml', contents: mlContents },
      ])
      setInputFileContents(heredoc`
        ----
        include::{examplesdir}/theme.css[tag=snippet]
        ----

        ----
        include::{examplesdir}/empty.ml[tag=snippet]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expect(doc.getBlocks()).to.have.lengthOf(2)
      const block0 = doc.getBlocks()[0]
      expect(block0.getContext()).to.equal('listing')
      expect(block0.getSourceLines()).to.eql([cssContents.split('\n')[1]])
      const block1 = doc.getBlocks()[1]
      expect(block1.getContext()).to.equal('listing')
      expect(block1.getSourceLines()).to.eql([mlContents.split('\n')[1]])
    })

    it('should apply tag filtering to contents of include if negated tag is specified', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.be.empty()
    })

    it('should apply tag filtering to contents of include if tags separated by semi-colons are specified', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n').filter((l) => l.charAt() !== '#'))
    })

    it('should apply tag filtering to contents of include if tags separated by commas are specified', () => {
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
        include::{examplesdir}/ruby/greet.rb[tags="hello,goodbye"]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n').filter((l) => l.charAt() !== '#'))
    })

    it('should split include tag on comma if present and ignore semi-colons', () => {
      const includeContents = heredoc`
        # tag::hello[]
        puts "Hello, World!"
        # end::hello[]
        # tag::goodbye;adios[]
        puts "Goodbye, World!"
        # end::goodbye;adios[]
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags="hello,goodbye;adios"]
        ----
      `)
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(includeContents.split('\n').filter((l) => l.charAt() !== '#'))
    })

    it('should apply tag filtering to contents of include if negated tags are specified', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(['puts "Hello, World!"'])
    })

    it('should include nested tags when applying tag filtering to contents of include', () => {
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql([
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(['puts "Hello, World!"'])
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql([])
    })

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
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      // NOTE known issue that cursor is off by one line in custom include processor
      const expectedMessage =
        "page-a.adoc: line 4: mismatched end tag (expected 'goodbye' but found 'hello')" +
        ' at line 5 of include file: modules/module-a/examples/ruby/greet.rb'
      expect(messages).to.have.lengthOf(1)
      expect(messages[0]).to.include(expectedMessage)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(['puts "Hello, World!"', 'puts "Goodbye, World!"'])
    })

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
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      // NOTE known issue that cursor is off by one line in custom include processor
      const expectedMessage =
        "page-a.adoc: line 4: unexpected end tag 'hello' " +
        'at line 5 of include file: modules/module-a/examples/ruby/greet.rb'
      expect(messages).to.have.lengthOf(1)
      expect(messages[0]).to.include(expectedMessage)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(['puts "Hello, World!"'])
    })

    it('should warn if include tag is unclosed', () => {
      const includeContents = heredoc`
        puts "Please stand by..."
        # tag::hello[]
        puts "Hello, World!"
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
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      // NOTE known issue that cursor is off by one line in custom include processor
      const expectedMessage =
        "page-a.adoc: line 4: detected unclosed tag 'hello' " +
        'starting at line 2 of include file: modules/module-a/examples/ruby/greet.rb'
      expect(messages).to.have.lengthOf(1)
      expect(messages[0]).to.include(expectedMessage)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql(['puts "Hello, World!"'])
    })

    it('should warn if requested include tag is not found', () => {
      const includeContents = heredoc`
        puts "Please stand by..."
        puts "Hello, World!"
      `
      const contentCatalog = mockContentCatalog({
        family: 'example',
        relative: 'ruby/greet.rb',
        contents: includeContents,
      })
      setInputFileContents(heredoc`
        [source,ruby]
        ----
        include::{examplesdir}/ruby/greet.rb[tags=hello;yo]
        ----
      `)
      const [doc, messages] = captureStderr(() => loadAsciiDoc(inputFile, contentCatalog))
      // NOTE known issue that cursor is off by one line in custom include processor
      const expectedMessage =
        "page-a.adoc: line 4: tags 'hello, yo' not found in include file: modules/module-a/examples/ruby/greet.rb"
      expect(messages).to.have.lengthOf(1)
      expect(messages[0]).to.include(expectedMessage)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql([])
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql([
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
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('listing')
      expect(firstBlock.getSourceLines()).to.eql([
        'msgs = { hello: "Hello, World!", goodbye: "Goodbye, World!" }',
        'puts msgs[:goodbye]',
      ])
    })

    it('should resolve top-level include target relative to current page', () => {
      const includeContents = 'changelog'
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'changelog.adoc',
        contents: includeContents,
      }).spyOn('getByPath')
      setInputFileContents('include::changelog.adoc[]')
      const doc = loadAsciiDoc(inputFile, contentCatalog)
      expectCalledWith(contentCatalog.getByPath, {
        component: 'component-a',
        version: 'master',
        path: 'modules/module-a/pages/changelog.adoc',
      })
      const firstBlock = doc.getBlocks()[0]
      expect(firstBlock).not.to.be.undefined()
      expect(firstBlock.getContext()).to.equal('paragraph')
      expect(firstBlock.getSourceLines()).to.eql([includeContents])
    })
  })

  describe('page reference macro', () => {
    it('should skip an invalid page reference', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:component-b::#frag[The Page Title]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#', 'component-b::#frag')
    })

    it('should delegate the built-in converter to process an in-page reference', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:section-a[]\n\n== Section A')
      const config = {
        attributes: { idprefix: '', idseparator: '-' },
      }
      const html = loadAsciiDoc(inputFile, contentCatalog, config).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#section-a', 'Section A')
    })

    it('should delegate the built-in converter to process a normal link', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('https://example.com[Example Domain]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, 'https://example.com', 'Example Domain')
    })

    it('should skip an unresolved page reference', () => {
      const contentCatalog = mockContentCatalog().spyOn('getById')
      setInputFileContents('xref:4.5.6@component-b:module-b:topic-foo/topic-bar/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
        version: '1.1',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById', 'getComponent')
      setInputFileContents('xref:component-b::the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getComponent, 'component-b', 1)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '1.1',
        module: 'ROOT',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/1.1/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '1.0',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById', 'getComponent')
      setInputFileContents('xref:component-b::the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getComponent, 'component-b', 1)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '1.0',
        module: 'ROOT',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/1.0/the-topic/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, module, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: '2.0',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById', 'getComponent')
      setInputFileContents('xref:component-b:module-b:the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getComponent, 'component-b', 1)
      expectCalledWith(contentCatalog.getById, {
        component: 'component-b',
        version: '2.0',
        module: 'module-b',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, inputFile.pub.rootPath + '/component-b/2.0/module-b/the-page.html', 'The Page Title')
    })

    it('should convert a page reference with component, module, topic, and page', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-b',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById', 'getComponent')
      setInputFileContents('xref:component-b:module-b:the-topic/the-page.adoc[The Page Title]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getComponent, 'component-b', 1)
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expectPageLink(html, '../the-page.html', 'The Page Title')
    })

    it('should pass on attributes defined in xref macro', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:the-page.adoc[The Page Title,role=secret,opts=nofollow]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      })
      expect(html).to.include('<a href="the-page.html" class="page secret" rel="nofollow">The Page Title</a>')
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
        contents: 'xref:module-a:this-page.adoc[Link to Self]',
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectPageLink(html, 'this-page.html', 'Link to Self')
    })

    it('should convert a page reference to self with empty fragment', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:module-a:this-page.adoc#[Link to Self]',
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectPageLink(html, 'this-page.html', 'Link to Self')
    })

    it('should convert a deep page reference to self', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:module-a:this-page.adoc#the-fragment[Deep Link to Self]',
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectLink(html, '#the-fragment', 'Deep Link to Self')
    })

    it('should convert a deep page reference to self that matches docname', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:this-page.adoc#the-fragment[Deep Link to Self]',
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expect(contentCatalog.getById).to.not.have.been.called()
      expectLink(html, '#the-fragment', 'Deep Link to Self')
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
      const html = loadAsciiDoc(inputFile, contentCatalog, { relativizePageRefs: false }).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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
        contents: 'xref:module-a:this-page.adoc[Link to Self]',
        indexify: true,
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectPageLink(html, './', 'Link to Self')
    })

    it('should convert a page reference to self with empty fragment using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:module-a:this-page.adoc#[Link to Self]',
        indexify: true,
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectPageLink(html, './', 'Link to Self')
    })

    it('should convert a deep page reference to self using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:module-a:this-page.adoc#the-fragment[Deep Link to Self]',
        indexify: true,
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectLink(html, '#the-fragment', 'Deep Link to Self')
    })

    it('should convert a page reference to self that matches docname using indexified URLs', () => {
      const contentCatalog = mockContentCatalog({
        family: 'page',
        relative: 'this-page.adoc',
        contents: 'xref:module-a:this-page.adoc#the-fragment[Deep Link to Self]',
        indexify: true,
      }).spyOn('getById')
      inputFile = contentCatalog.getFiles()[0]
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'this-page.adoc',
      })
      expectLink(html, '#the-fragment', 'Deep Link to Self')
    })

    it('should use default content for page reference if content not specified', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:module-b:the-topic/the-page.adoc[]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
      expectCalledWith(contentCatalog.getById, {
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      })
      // TODO eventually this will resolve to the title of the target page
      expectPageLink(html, '../module-b/the-topic/the-page.html', 'module-b:the-topic/the-page.adoc')
    })

    it('should use default content for page reference with fragment if content not specified', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-b',
        family: 'page',
        relative: 'the-topic/the-page.adoc',
      }).spyOn('getById')
      setInputFileContents('xref:module-b:the-topic/the-page.adoc#frag[]')
      const html = loadAsciiDoc(inputFile, contentCatalog).convert()
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

    it('should not fail to process page reference if fragment attribute is not set', () => {
      const contentCatalog = mockContentCatalog({
        component: 'component-a',
        version: 'master',
        module: 'module-a',
        family: 'page',
        relative: 'the-page.adoc',
      })
      setInputFileContents('man:the-page[]')
      const extension = function () {
        this.process((parent, target, attrs) =>
          this.createInline(parent, 'anchor', target, {
            type: 'xref',
            target,
            attributes: global.Opal.hash({ refid: target, path: target }),
          })
        )
      }
      extension.register = (registry) => registry.inlineMacro('man', extension)
      const config = { extensions: [extension] }
      const html = loadAsciiDoc(inputFile, contentCatalog, config).convert()
      expectPageLink(html, 'the-page.html', 'the-page')
    })
  })

  describe('resolveConfig()', () => {
    it('should return config with built-in attributes if site and asciidoc categories not set in playbook', () => {
      const config = resolveConfig()
      expect(config.attributes).to.exist()
      expect(config.attributes).to.include({
        env: 'site',
        'site-gen': 'antora',
        'attribute-missing': 'warn',
      })
      expect(config.attributes['site-title']).to.not.exist()
      expect(config.attributes['site-url']).to.not.exist()
      expect(config.extensions).to.not.exist()
    })

    it('should return config with attributes for site title and url if set in playbook', () => {
      const playbook = { site: { url: 'https://docs.example.org', title: 'Docs' }, ui: {} }
      const config = resolveConfig(playbook)
      expect(config.attributes).to.exist()
      expect(config.attributes).to.include({
        'site-title': 'Docs',
        'site-url': 'https://docs.example.org',
      })
    })

    it('should return a copy of the asciidoc category in the playbook', () => {
      const playbook = {
        asciidoc: {
          attributes: {
            idprefix: '',
            idseparator: '-',
          },
        },
      }
      const config = resolveConfig(playbook)
      expect(config).to.not.equal(playbook.asciidoc)
      expect(config.attributes).to.not.equal(playbook.asciidoc.attributes)
      expect(config.attributes).to.include(playbook.asciidoc.attributes)
    })

    it('should not load extensions if extensions are not defined', () => {
      const playbook = { asciidoc: {} }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.not.exist()
    })

    it('should not load extensions if extensions are empty', () => {
      const playbook = { asciidoc: { extensions: [] } }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.not.exist()
    })

    it('should load scoped extension into config but not register it globally', () => {
      const playbook = { asciidoc: { extensions: [ospath.resolve(FIXTURES_DIR, 'ext/scoped-shout-block.js')] } }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.exist()
      expect(config.extensions).to.have.lengthOf(1)
      expect(config.extensions[0]).to.be.instanceOf(Function)
      const Extensions = Asciidoctor.Extensions
      const extensionGroupNames = Object.keys(Extensions.getGroups())
      expect(extensionGroupNames).to.have.lengthOf(0)
    })

    it('should load global extension and register it globally', () => {
      const playbook = { asciidoc: { extensions: [ospath.resolve(FIXTURES_DIR, 'ext/global-shout-block.js')] } }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.not.exist()
      const Extensions = Asciidoctor.Extensions
      const extensionGroupNames = Object.keys(Extensions.getGroups())
      expect(extensionGroupNames).to.have.lengthOf(1)
      Extensions.unregisterAll()
    })

    it('should only register a global extension once', () => {
      const playbook = { asciidoc: { extensions: [ospath.resolve(FIXTURES_DIR, 'ext/global-shout-block.js')] } }
      resolveConfig(playbook)
      resolveConfig(playbook)
      const Extensions = Asciidoctor.Extensions
      const extensionGroupNames = Object.keys(Extensions.getGroups())
      expect(extensionGroupNames).to.have.lengthOf(1)
      Extensions.unregisterAll()
    })

    it('should load extension relative to playbook dir', () => {
      const playbook = {
        dir: FIXTURES_DIR,
        asciidoc: {
          extensions: ['./ext/scoped-shout-block.js'],
        },
      }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.exist()
      expect(config.extensions).to.have.lengthOf(1)
      expect(config.extensions[0]).to.be.instanceOf(Function)
    })

    it('should load extension from modules path', () => {
      const playbook = {
        dir: FIXTURES_DIR,
        asciidoc: {
          extensions: ['lorem-block-macro'],
        },
      }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.exist()
      expect(config.extensions).to.have.lengthOf(1)
      expect(config.extensions[0]).to.be.instanceOf(Function)
    })

    it('should load all extensions', () => {
      const playbook = {
        dir: FIXTURES_DIR,
        asciidoc: {
          extensions: [
            './ext/scoped-shout-block.js',
            'lorem-block-macro',
            ospath.resolve(FIXTURES_DIR, 'ext/global-shout-block.js'),
          ],
        },
      }
      const config = resolveConfig(playbook)
      expect(config.extensions).to.exist()
      expect(config.extensions).to.have.lengthOf(2)
      expect(config.extensions[0]).to.be.instanceOf(Function)
      expect(config.extensions[1]).to.be.instanceOf(Function)
      const Extensions = Asciidoctor.Extensions
      const extensionGroupNames = Object.keys(Extensions.getGroups())
      expect(extensionGroupNames).to.have.lengthOf(1)
      Extensions.unregisterAll()
    })
  })
})
