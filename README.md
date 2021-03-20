# Obsidian PlantUML

Render [PlantUML](https://plantuml.com) Diagrams in [Obsidian](https://obsidian.md)

![Demonstration](https://i.imgur.com/LYwFWPp.gif)

This plugin uses the [PlantUML Online Server](https://plantuml.com/server) for rendering.

You can also host your own server
([Docker](https://hub.docker.com/r/plantuml/plantuml-server) /
[JEE](https://plantuml.com/de/server) /
[PicoWeb](https://plantuml.com/de/picoweb)) and specify its address in the settings.


## Installation

### Inside Obsidian

`Settings > Third-party plugins > Community Plugins > Browse` and search for `PlantUML`.

### Manually installing the plugin

- Clone this repo
- `npm i` or `yarn` to install dependencies
- `npm run build`  
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/obsidian-plantuml/`.
