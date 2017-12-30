/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')
const versionCompareDesc = require('@antora/content-classifier/lib/util/version-compare-desc')

describe('versionCompareDesc()', () => {
  it('should order versions in descending order', () => {
    const versions = ['1.0', '2.0', '1.1']

    versions.sort(versionCompareDesc)
    expect(versions).to.eql(['2.0', '1.1', '1.0'])
  })

  it('should order versions in descending order when versions begin with "v"', () => {
    const versions = ['v1.0', 'v2.0', 'v1.1']

    versions.sort(versionCompareDesc)
    expect(versions).to.eql(['v2.0', 'v1.1', 'v1.0'])
  })

  it('should order master version before other versions', () => {
    const versionFixtures = [['1.0', 'master'], ['master', '1.0']]

    versionFixtures.forEach((versions) => {
      versions.sort(versionCompareDesc)
      expect(versions).to.eql(['master', '1.0'])
    })
  })

  it('should order final version before pre-release versions', () => {
    const versions = ['1.0-alpha.1', '1.0', '1.0-alpha.2']

    versions.sort(versionCompareDesc)
    expect(versions).to.eql(['1.0', '1.0-alpha.2', '1.0-alpha.1'])
  })

  it('should help ensure order is maintained on insertion', () => {
    const versions = [{ version: '2.0' }, { version: '1.1' }, { version: '1.0' }]

    let newVersion
    let insertIdx

    newVersion = { version: '3.0' }
    insertIdx = versions.findIndex((candidate) => versionCompareDesc(candidate.version, newVersion.version) > 0)
    expect(insertIdx).to.equal(0)

    newVersion = { version: '1.2' }
    insertIdx = versions.findIndex((candidate) => versionCompareDesc(candidate.version, newVersion.version) > 0)
    expect(insertIdx).to.equal(1)

    newVersion = { version: '0.9' }
    insertIdx = versions.findIndex((candidate) => versionCompareDesc(candidate.version, newVersion.version) > 0)
    expect(insertIdx).to.equal(-1)
  })
})
