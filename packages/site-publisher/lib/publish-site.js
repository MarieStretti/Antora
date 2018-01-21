'use strict'

const requireProvider = createRequireProvider()
const streamify = require('streamify-array')

const { DEFAULT_DEST_FS } = require('./constants.js')

async function publishSite (playbook, contentCatalog, uiCatalog) {
  const destinations = getDestinations(playbook.output)

  if (!destinations.length) return

  const publishers = destinations.map((destination) => {
    const { provider, options } = resolveDestination(destination)
    switch (provider) {
      case 'archive':
      case 'fs':
        return requireProvider('./providers/' + provider).bind(null, options)
      default:
        // FIXME attempt to require unknown provider, fail if can't be found
        throw new Error('Unsupported destination provider')
    }
  })

  // Q: add getPublishableFiles / getOutFiles; return a stream? or getOutFilesAsStream?
  // Q: do we need to recreate stream for each publisher?
  const files = streamify(contentCatalog.getFiles().concat(uiCatalog.getFiles()).filter((file) => file.out))
  // perhaps we should return a report of virtual files that were published (by provider)
  return Promise.all(publishers.map(async (publish) => publish(files)))
}

function createRequireProvider () {
  const cache = {}
  return (name) => (name in cache ? cache[name] : (cache[name] = require(name)))
}

function getDestinations (output) {
  let destinations = output.destinations
  if (output.dir) {
    if (destinations && destinations.length) {
      destinations = destinations.slice(0)
      const primaryFsDestIdx = destinations.findIndex(({ provider: candidate }) => candidate === 'fs')
      if (~primaryFsDestIdx) {
        ;(destinations[primaryFsDestIdx] = Object.assign({}, destinations[primaryFsDestIdx])).path = output.dir
      } else {
        destinations.unshift({ provider: 'fs', path: output.dir })
      }
    } else {
      destinations = [{ provider: 'fs', path: output.dir }]
    }
  } else if (!destinations) {
    destinations = [{ provider: 'fs', path: DEFAULT_DEST_FS }]
  }

  return destinations
}

function resolveDestination (destination) {
  const provider = destination.provider
  const options = Object.assign({}, destination)
  delete options.provider
  return { provider, options }
}

module.exports = publishSite
