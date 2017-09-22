'use strict'

// This is a unit test reference, try to mimick its style ;-)

// Always require test-utils, if you don't need to spy on callbacks, you can just import "expect"
const { expect, spy } = require('./test-utils')

// Require the functions to be tested
const { capitalize, capitalizeArray, capitalizeKeys, asyncCapitalize, capitalizeStream } = require('../lib-example/capitalize.js')

// NOTE: these requires are only there to test arrays
const toStream = require('array-to-stream')
const toArray = require('stream-to-array')

describe('text-utils#capitalize', () => {

  it('should uppercase first letter', () => {
    const text = 'hello'
    const capitalizedText = capitalize(text)
    expect(capitalizedText).to.equal('Hello')
    // All assertion should be function calls and not just expressions like "to.be.true"
    // https://eslint.org/docs/rules/no-unused-expressions
    // this is provided by the dirty-chai plugin
    expect(capitalizedText === 'Hello').to.be.true()
  })

  it('should lowercase other letters', () => {
    const text = 'HELLO'
    const capitalizedText = capitalize(text)
    expect(capitalizedText).to.equal('Hello')
  })

  it('should leave numbers unchanged', () => {
    const text = '12'
    const capitalizedText = capitalize(text)
    expect(capitalizedText).to.equal('12')
    // expect#equal is a strict === comparison
    expect(capitalizedText).not.to.equal(12)
  })
})

describe('text-utils#capitalizeArray', () => {

  it('should capitalize all items of an array', () => {
    const array = ['zerO', 'onE', 'twO', 'threE']
    // if the expected result is used many times, consider using a variable
    const expectedArray = ['Zero', 'One', 'Two', 'Three']
    const capitalizedArray = capitalizeArray(array)
    // expect#eql only looks at items in the array, it doesn't compare the array instances
    expect(capitalizedArray).to.eql(expectedArray)
    // expect#equal fails on two different array instances
    expect(capitalizedArray).not.to.equal(expectedArray)
  })
})

describe('text-utils#capitalizeKeys', () => {

  let object
  let expectedObject

  // if mock objects/inputs need to be set up for several tests, consider using beforeEach()
  beforeEach(() => {
    object = { zerO: '00', onE: '11', twO: '22', threE: '33' }
    expectedObject = { Zero: '00', One: '11', Two: '22', Three: '33' }
  })

  it('should capitalize all keys', () => {
    const capitalizedKeysObject = capitalizeKeys(object)
    // expect#eql only looks at keys and values in the object, it doesn't compare the object instances
    expect(capitalizedKeysObject).to.eql(expectedObject)
    // expect#equal fails on two different object instances
    expect(capitalizedKeysObject).not.to.equal(expectedObject)
  })

  it('should not capitalize deep keys (since it is not recursive)', () => {
    object.fouR = { valuE: '44' }
    expectedObject.Four = { valuE: '44' }
    const capitalizedKeysObject = capitalizeKeys(object)
    // expect#eql only looks at keys and values in the object, it doesn't compare the object instances
    expect(capitalizedKeysObject).to.eql(expectedObject)
    // expect#equal fails on two different object instances
    expect(capitalizedKeysObject).not.to.equal(expectedObject)
  })
})

describe('text-utils#asyncCapitalize', () => {

  // try to avoid async/await in tests
  // The API from "chai-as-promised" like #to.eventually.equal() gives better logs
  it('should uppercase first letter AND lowercase other letters', () => {
    const text = 'hELLO'
    const capitalizedText = asyncCapitalize(text)
    return expect(capitalizedText).to.be.fulfilled.and.eventually.equal('Hello')
  })

  it('should reject null value', () => {
    const text = null
    const capitalizedText = asyncCapitalize(text)
    // don't forget to return the promise as the result of the it() test function!
    return expect(capitalizedText).to.be.rejectedWith(TypeError)
  })
})

describe('text-utils#capitalizeStream', () => {

  let endCallback
  let errorCallback

  // beforeEach() is even more useful when it comes to setup spies (the call counts are reset on each tests)
  beforeEach(() => {
    // giving a name to a spy makes things easy in test logs
    endCallback = spy('endCallback')
    errorCallback = spy('errorCallback')
  })

  it('should capitalize all items of a stream', () => {
    const textStream = toStream(['zerO', 'onE', 'twO', 'threE'])
    const capitalizedStream = textStream
      .pipe(capitalizeStream())
      .on('error', errorCallback)
      .on('end', endCallback)
    // it's easier to convert streams to arrays to test their result
    const capitalizedArray = toArray(capitalizedStream)
    // don't forget to return the promise as the result of the it() test function!
    return expect(capitalizedArray).to.be.fulfilled.and.to.eventually.eql(['Zero', 'One', 'Two', 'Three'])
      .then(() => {
        // callback need to be tested asynchronously (after the stream is finished)
        expect(errorCallback).not.to.have.been.called()
        expect(endCallback).to.have.been.called.once()
      })
  })

  it('should emit an error if one of the items is not a String', () => {
    const textStream = toStream(['zerO', 'onE', 22, 'threE'])
    const capitalizedStream = textStream
      .pipe(capitalizeStream())
      .on('error', errorCallback)
      .on('end', endCallback)
    const capitalizedArray = toArray(capitalizedStream)
    // don't forget to return the promise as the result of the it() test function!
    return expect(capitalizedArray).to.be.rejectedWith(TypeError)
      .then(() => {
        expect(errorCallback).to.have.been.called.once()
        expect(endCallback).not.to.have.been.called.once()
      })
  })
})
