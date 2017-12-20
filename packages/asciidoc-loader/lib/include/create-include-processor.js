'use strict'

const CIRCUMFIX_COMMENT_SUFFIX_RX = new RegExp(' (?:\\*[/)]|--%?>)$')
const NEWLINE_RX = /\r\n?|\n/
const TAG_DELIMITER_RX = /[,;]/
const TAG_DIRECTIVE_RX = /\b(?:tag|(end))::(\S+)\[\]$/

function createIncludeProcessor (callback) {
  return function () {
    this.handles((target) => !!callback)
    this.process((doc, reader, target, attrs) => {
      const resolvedFile = callback(doc, target, doc.reader.getCursor())
      if (resolvedFile) {
        let contents = resolvedFile.contents
        let startLineNum = 1
        const tags = getTags(attrs)
        if (tags) [contents, startLineNum] = filterByTags(contents, tags)
        reader.pushInclude(contents, resolvedFile.file, resolvedFile.path, startLineNum, attrs)
      }
    })
  }
}

function getTags (attrs) {
  if (attrs['$key?']('tag')) {
    const tag = attrs['$[]']('tag')
    if (tag && tag !== '!') {
      return tag.startsWith('!') ? { [tag.substr(1)]: false } : { [tag]: true }
    }
  } else if (attrs['$key?']('tags')) {
    const tags = attrs['$[]']('tags')
    if (tags) {
      let result = {}
      let any = false
      tags.split(TAG_DELIMITER_RX).forEach((tag) => {
        if (tag && tag !== '!') {
          any = true
          if (tag.startsWith('!')) {
            result[tag.substr(1)] = false
          } else {
            result[tag] = true
          }
        }
      })
      if (any) return result
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
  contents.split(NEWLINE_RX).forEach((line) => {
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
          ;[activeTag, selecting] = tagStack.length ? tagStack[0] : [undefined, selectingDefault]
        } else if (thisTag in tags) {
          const idx = tagStack.findIndex(([name]) => name === thisTag)
          if (idx !== -1) {
            tagStack.splice(idx, 1)
            //console.warn(`line ${lineNum}: mismatched end tag in include: expected ${activeTag}, found ${thisTag}`)
          }
          //} else {
          //  //console.warn(`line ${lineNum}: unexpected end tag in include: ${thisTag}`)
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
      if (!startLineNum) startLineNum = lineNum
      lines.push(line)
    }
  })
  // Q: use _.difference(Object.keys(tags), usedTags)?
  //const missingTags = Object.keys(tags).filter((e) => !usedTags.includes(e))
  //if (missingTags.length) {
  //  console.warn(`tag${missingTags.length > 1 ? 's' : ''} '${missingTags.join(',')}' not found in include`)
  //}
  return [lines, startLineNum || 1]
}

module.exports = createIncludeProcessor
