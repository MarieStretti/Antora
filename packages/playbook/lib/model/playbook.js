class Playbook {
  constructor (config) {
    this.location = config.get('playbook')
    this.site = new Site(config)
    // this.content = ...
    // this.ui = ...
    // ...
  }
}

class Site {
  constructor (config) {
    this.url = config.get('site.url')
    this.title = config.get('site.title')
    // ...
  }
}

// use temporarily to avoid eslint error
Playbook({})
