'use strict'

const fs = require('fs')
const git = require('nodegit')
const path = require('path')
const { promisify } = require('util')
const { version } = require('../lerna.json')

const PROJECT_ROOT_DIR = path.join(__dirname, '..')
const CHANGELOG_FILE = path.join(PROJECT_ROOT_DIR, 'CHANGELOG.adoc')
;(async () => {
  const now = new Date()
  const currentDate = new Date(now - now.getTimezoneOffset() * 60000).toISOString().split('T')[0]
  await promisify(fs.readFile)(CHANGELOG_FILE, 'utf8').then((changelog) =>
    promisify(fs.writeFile)(CHANGELOG_FILE, changelog.replace(/^== Unreleased$/m, `== ${version} (${currentDate})`))
  )
  await git.Repository.open(PROJECT_ROOT_DIR).then((repo) =>
    repo
      .refreshIndex()
      .then((index) => index.addByPath('CHANGELOG.adoc').then(() => index.write().then(() => index.writeTree())))
  )
})()
