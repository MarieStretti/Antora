'use strict'

const $menus = Symbol('menus')
const $generateId = Symbol('generateId')

class NavigationCatalog {
  constructor () {
    this[$menus] = {}
  }

  addTree (component, version, tree) {
    const id = this[$generateId](component, version)
    const menu = id in this[$menus] ? this[$menus][id] : (this[$menus][id] = [])
    // NOTE insert into array in sorted order
    const insertIdx = menu.findIndex((candidate) => candidate.order > tree.order)
    insertIdx !== -1 ? menu.splice(insertIdx, 0, tree) : menu.push(tree)
    //menu.splice(_.sortedIndexBy(menu, tree, 'order'), 0, tree)
  }

  //getMenus () {
  //  return _.map(this[$menus], (trees, id) => {
  //    const [component, version] = id.split(':')
  //    return { component, version, trees }
  //  })
  //}

  getMenu (component, version) {
    const id = this[$generateId](component, version)
    return this[$menus][id]
  }

  [$generateId] (component, version) {
    return component + ':' + version
  }
}

module.exports = NavigationCatalog
