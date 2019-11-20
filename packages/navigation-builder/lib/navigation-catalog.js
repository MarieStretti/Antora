'use strict'

const $sets = Symbol('sets')
const $generateId = Symbol('generateId')

class NavigationCatalog {
  constructor () {
    this[$sets] = {}
  }

  addTree (component, version, tree) {
    const id = this[$generateId](component, version)
    const navigation = this[$sets][id] || (this[$sets][id] = [])
    // NOTE retain order on insert
    const insertIdx = navigation.findIndex((candidate) => candidate.order >= tree.order)
    ~insertIdx ? navigation.splice(insertIdx, 0, tree) : navigation.push(tree)
    return navigation
  }

  addNavigation (component, version, trees) {
    return (this[$sets][this[$generateId](component, version)] = trees.sort((a, b) => a.order - b.order))
  }

  getNavigation (component, version) {
    const id = this[$generateId](component, version)
    return this[$sets][id]
  }

  [$generateId] (component, version) {
    return version + '@' + component
  }
}

module.exports = NavigationCatalog
