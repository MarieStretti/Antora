'use strict'

const TAG_DELIMITER_RX = /[,;]/
const LINE_DELIMITER_RX = /\r\n?|\n/
const TAG_DIRECTIVE_RX = /\b(?:tag|(end))::(\S+)\[\]$/
const CIRCUMFIX_COMMENT_SUFFIX_RX = new RegExp(' (?:\\*[/)]|--%?>)$')

module.exports = (asciidoctor, callbacks) => {
  const registry = asciidoctor.Extensions.create()
  registry.includeProcessor(function () {
    this.handles((target) => !!callbacks.onInclude)
    this.process((doc, reader, target, attrs) => {
      const resolvedFile = callbacks.onInclude(doc, target, doc.reader.getCursor())
      if (resolvedFile) {
        let contents = resolvedFile.contents
        let startLineNum = 1
        const tags = getTags(attrs)
        if (tags) [contents, startLineNum] = filterByTags(contents, tags)
        reader.pushInclude(contents, resolvedFile.file, resolvedFile.path, startLineNum, attrs)
      }
    })
  })
  return registry
}

function getTags (attrs) {
  if (attrs['$key?']('tag')) {
    const tagSpec = attrs['$[]']('tag')
    if (tagSpec && tagSpec !== '!') {
      return tagSpec.startsWith('!') ? { [tagSpec.substr(1)]: false } : { [tagSpec]: true }
    }
  } else if (attrs['$key?']('tags')) {
    const tagsSpec = attrs['$[]']('tags')
    let tags = {}
    let hasTags = false
    if (tagsSpec) {
      tagsSpec.split(TAG_DELIMITER_RX).forEach((tagSpec) => {
        if (tagSpec && tagSpec !== '!') {
          hasTags = true
          if (tagSpec.startsWith('!')) {
            tags[tagSpec.substr(1)] = false
          } else {
            tags[tagSpec] = true
          }
        }
      })
      if (hasTags) {
        return tags
      }
    }
  }
}

function filterByTags (contents, tags) {
  let selecting, selectingDefault, wildcard
  if ('**' in tags) {
    if ('*' in tags) {
      selectingDefault = selecting = tags['**']
      wildcard = tags['*']
      delete tags['*']
    } else {
      selectingDefault = selecting = wildcard = tags['**']
    }
    delete tags['**']
  } else {
    selectingDefault = selecting = !Object.values(tags).includes(true)
    if ('*' in tags) {
      wildcard = tags['*']
      delete tags['*']
    }
  }

  const lines = []
  const tagStack = []
  const usedTags = []
  let activeTag
  let lineNum = 0
  let startLineNum
  contents.split(LINE_DELIMITER_RX).forEach((line) => {
    lineNum += 1
    let m
    let l = line
    if (
      (l.endsWith('[]') ||
        (l.includes('[] ') &&
          (m = l.match(CIRCUMFIX_COMMENT_SUFFIX_RX)) &&
          (l = l.slice(0, m.index)).endsWith('[]'))) &&
      (m = l.match(TAG_DIRECTIVE_RX))
    ) {
      const thisTag = m[2]
      if (m[1]) {
        if (thisTag === activeTag) {
          tagStack.shift()
          if (tagStack.length) {
            activeTag = tagStack[0][0]
            selecting = tagStack[0][1]
          } else {
            activeTag = undefined
            selecting = selectingDefault
          }
        } else if (thisTag in tags) {
          const idx = tagStack.findIndex(([name]) => name === thisTag)
          if (idx !== -1) {
            tagStack.splice(idx, 1)
            //console.log(`line ${lineNum}: mismatched end tag in include: expected ${activeTag}, found ${thisTag}`)
          }
          //} else {
          //  //console.log(`line ${lineNum}: unexpected end tag in include: ${thisTag}`)
          //}
        }
      } else if (thisTag in tags) {
        usedTags.push(thisTag)
        tagStack.unshift([(activeTag = thisTag), (selecting = tags[thisTag])])
      } else if (wildcard !== undefined) {
        selecting = activeTag && !selecting ? false : wildcard
        tagStack.unshift([(activeTag = thisTag), selecting])
      }
    } else if (selecting) {
      // record line where we started selecting
      if (!startLineNum) startLineNum = lineNum
      lines.push(line)
    }
  })
  //const missingTags = Object.keys(tags).filter((e) => !usedTags.includes(e))
  //if (missingTags.length) {
  //  console.log(`tag${missingTags.length > 1 ? 's' : ''} '${missingTags.join(',')}' not found in include`)
  //}
  return [lines, startLineNum || 1]
}
