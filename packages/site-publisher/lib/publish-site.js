'use strict'

const ReadableArray = require('./util/readable-array')
const requireProvider = require('./require-provider')()

const { DEFAULT_DEST_FS } = require('./constants.js')

// perhaps we should return a report of virtual files that were published (by provider)
async function publishSite (playbook, contentCatalog, uiCatalog) {
  const destinations = getDestinations(playbook.output)

  if (!destinations.length) return

  const clean = playbook.output.clean
  const publishers = destinations.map((destination) => {
    const { provider, options } = resolveDestination(destination, clean)
    switch (provider) {
      case 'archive':
      case 'fs':
        return require('./providers/' + provider).bind(null, options)
      default:
        try {
          // FIXME use playbook dir instead of process.cwd()
          return requireProvider(provider, process.cwd()).bind(null, options)
        } catch (e) {
          throw new Error('Unsupported destination provider: ' + provider)
        }
    }
  })

  // Q: add getPublishableFiles / getOutFiles; return a stream? or getOutFilesAsStream?
  const files = contentCatalog.getFiles().concat(uiCatalog.getFiles()).filter((file) => file.out)
  //const stream = cloneable(new ReadableArray(files))
  //return Promise.all(publishers.map((publish, idx) => publish(idx ? stream.clone() : stream)))
  return Promise.all(publishers.map((publish) => publish(new ReadableArray(files), playbook)))
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

function resolveDestination (destination, clean) {
  const provider = destination.provider
  const options = Object.assign({}, destination)
  delete options.provider
  if (clean) options.clean = true
  return { provider, options }
}

module.exports = publishSite
