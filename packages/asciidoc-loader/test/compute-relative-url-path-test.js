/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

const computeRelativeUrlPath = require('@antora/asciidoc-loader/lib/util/compute-relative-url-path')

describe('computeRelativeUrlPath()', () => {
  describe('file paths with .html extension', () => {
    it('should compute URL to file in same directory', () => {
      expect(computeRelativeUrlPath('/dir/from.html', '/dir/to.html')).to.equal('to.html')
    })

    it('should compute URL to file in subdirectory', () => {
      expect(computeRelativeUrlPath('/dir/from.html', '/dir/subdir/to.html')).to.equal('subdir/to.html')
    })

    it('should compute URL to file in parent directory', () => {
      expect(computeRelativeUrlPath('/dir/subdir/from.html', '/dir/to.html')).to.equal('../to.html')
    })

    it('should compute URL to self', () => {
      expect(computeRelativeUrlPath('/dir/file.html', '/dir/file.html')).to.equal('file.html')
    })

    it('should compute URL to index file', () => {
      expect(computeRelativeUrlPath('/dir/from.html', '/dir/index.html')).to.equal('index.html')
    })
  })

  describe('extensionless file paths', () => {
    it('should compute URL to file in same directory', () => {
      expect(computeRelativeUrlPath('/dir/from', '/dir/to')).to.equal('to')
    })

    it('should compute URL to file in subdirectory', () => {
      expect(computeRelativeUrlPath('/dir/from', '/dir/subdir/to')).to.equal('subdir/to')
    })

    it('should compute URL to file in parent directory', () => {
      expect(computeRelativeUrlPath('/dir/subdir/from', '/dir/to')).to.equal('../to')
    })

    it('should compute URL to self', () => {
      expect(computeRelativeUrlPath('/dir/file', '/dir/file')).to.equal('file')
    })
  })

  describe('indexified directory paths', () => {
    it('should compute URL to sibling directory', () => {
      expect(computeRelativeUrlPath('/dir/from/', '/dir/to/')).to.equal('../to/')
    })

    it('should compute URL to subdirectory', () => {
      expect(computeRelativeUrlPath('/dir/from/', '/dir/from/to/')).to.equal('to/')
    })

    it('should compute URL to parent directory', () => {
      expect(computeRelativeUrlPath('/dir/from/', '/dir/')).to.equal('../')
    })

    it('should compute URL to self', () => {
      expect(computeRelativeUrlPath('/dir/from/', '/dir/from/')).to.equal('./')
    })

    it('should compute URL to root', () => {
      expect(computeRelativeUrlPath('/dir/from/', '/')).to.equal('../../')
    })
  })

  describe('with hash', () => {
    it('should compute URL to different file', () => {
      expect(computeRelativeUrlPath('/from.html', '/to.html', '#the-fragment')).to.equal('to.html#the-fragment')
    })

    it('should compute URL to self', () => {
      expect(computeRelativeUrlPath('/file.html', '/file.html', '#the-fragment')).to.equal('#the-fragment')
    })

    it('should compute URL to different indexified file', () => {
      expect(computeRelativeUrlPath('/from/', '/to/', '#the-fragment')).to.equal('../to/#the-fragment')
    })

    it('should compute URL to indexified self', () => {
      expect(computeRelativeUrlPath('/file/', '/file/', '#the-fragment')).to.equal('#the-fragment')
    })
  })
})
