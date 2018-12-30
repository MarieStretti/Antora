'use strict'

module.exports = (...tasks) => {
  if (!tasks.length) return {}
  return tasks.reduce((acc, task) => (acc[task.displayName || task.name] = task) && acc, {
    default: Object.assign(tasks[0].bind(null), { description: `=> ${tasks[0].displayName}`, displayName: 'default' }),
  })
}
