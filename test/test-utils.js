'use strict'

const chai = require('chai')
const expect = chai.expect

const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

const spies = require('chai-spies')
chai.use(spies)

module.exports = { expect, spy: chai.spy }
