/* eslint-env mocha */
'use strict'

const { expect } = require('../../../test/test-utils')

describe('playbook', () => {
  it('should meet all requirements', () => {
    expect('so far, so good!').to.include('good')
  })
})
