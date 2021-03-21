# Obsidian PlantUML

Render [PlantUML](https://plantuml.com) Diagrams in [Obsidian](https://obsidian.md)

![Demonstration](https://i.imgur.com/Ueyw0SE.gif)

This plugin uses the [PlantUML Online Server](https://plantuml.com/server) for rendering.

You can also host your own server
([Docker](https://hub.docker.com/r/plantuml/plantuml-server) /
[JEE](https://plantuml.com/de/server) /
[PicoWeb](https://plantuml.com/de/picoweb)) and specify its address in the settings.

## Usage
Create a fenced codeblock using 'plantuml' as the language.
Specify your plantuml code inside.

Documentation on Plantuml can be found on [plantuml.com](https://plantuml.com/)


## Examples

```yaml
    ```plantuml
    Bob -> Alice : hello
    Alice -> Wonderland: hello
    Wonderland -> next: hello
    next -> Last: hello
    Last -> next: hello
    next -> Wonderland : hello
    Wonderland -> Alice : hello
    Alice -> Bob: hello
    ```
```
results in:

![](http://www.plantuml.com/plantuml/png/SyfFEhH0r-xG0iUSpEJKGmki3Yt8ICt9oUS2yo5IuVbvAQb5EObvAN1PX114ILvgHGbSKW48G08GAP_4ObGfa011NSWMe2X1IA2x6w46oUr0_y6a0000)

```yaml
    ```plantuml-ascii
    Bob -> Alice : hello
    Alice -> Wonderland: hello
    Wonderland -> next: hello
    next -> Last: hello
    Last -> next: hello
    next -> Wonderland : hello
    Wonderland -> Alice : hello
    Alice -> Bob: hello
    ```
```
Results in:
```
     ┌───┐          ┌─────┐          ┌──────────┐          ┌────┐          ┌────┐
     │Bob│          │Alice│          │Wonderland│          │next│          │Last│
     └─┬─┘          └──┬──┘          └────┬─────┘          └─┬──┘          └─┬──┘
       │    hello      │                  │                  │               │   
       │──────────────>│                  │                  │               │   
       │               │                  │                  │               │   
       │               │      hello       │                  │               │   
       │               │─────────────────>│                  │               │   
       │               │                  │                  │               │   
       │               │                  │       hello      │               │   
       │               │                  │ ─────────────────>               │   
       │               │                  │                  │               │   
       │               │                  │                  │     hello     │   
       │               │                  │                  │ ──────────────>   
       │               │                  │                  │               │   
       │               │                  │                  │     hello     │   
       │               │                  │                  │ <──────────────   
       │               │                  │                  │               │   
       │               │                  │       hello      │               │   
       │               │                  │ <─────────────────               │   
       │               │                  │                  │               │   
       │               │      hello       │                  │               │   
       │               │<─────────────────│                  │               │   
       │               │                  │                  │               │   
       │    hello      │                  │                  │               │   
       │<──────────────│                  │                  │               │   
     ┌─┴─┐          ┌──┴──┐          ┌────┴─────┐          ┌─┴──┐          ┌─┴──┐
     │Bob│          │Alice│          │Wonderland│          │next│          │Last│
     └───┘          └─────┘          └──────────┘          └────┘          └────┘
```

## Installation

### Inside Obsidian

`Settings > Third-party plugins > Community Plugins > Browse` and search for `PlantUML`.

### Manually installing the plugin

- Clone this repo
- `npm i` or `yarn` to install dependencies
- `npm run build`  
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/obsidian-plantuml/`.
