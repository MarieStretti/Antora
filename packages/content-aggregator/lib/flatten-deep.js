'use strict'

module.exports = (array) => {
  let next
  const source = array.slice(0)
  const result = []
  while (source.length) Array.isArray((next = source.pop())) ? source.push(...next) : result.push(next)
  return result.reverse()
}
