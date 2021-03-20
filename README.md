# Obsidian PlantUML

Render [PlantUML](https://plantuml.com) Diagrams in [Obsidian](https://obsidian.md)

![Demonstration](https://i.imgur.com/LYwFWPp.gif)

This plugin uses the [PlantUML Online Server](https://plantuml.com/server) for rendering.

You can also host your own server
([Docker](https://hub.docker.com/r/plantuml/plantuml-server) /
[JEE](https://plantuml.com/de/server) /
[PicoWeb](https://plantuml.com/de/picoweb)) and specify its address in the settings.

## Usage
Create a fenced codeblock using 'plantuml' as the lange.
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
![](http://www.plantuml.com/plantuml/png/SyfFEhH0r-xG0iUSpEJKGmki3Yt8ICt9oUS2yo5IuVbvAQb5EObvAN1PX114ILvgHGbSKW48G08GAP_4ObGfa011NSWMe2X1IA2x6w46oUr0_y6a0000)

```yaml
    ```plantuml
    start
    if (condition A) then (yes)
      :Text 1;
    elseif (condition B) then (yes)
      :Text 2;
      stop
    elseif (condition C) then (yes)
      :Text 3;
    elseif (condition D) then (yes)
      :Text 4;
    else (nothing)
      :Text else;
    endif
    stop
    ```
```

![](http://www.plantuml.com/plantuml/png/Aov9B2hXoanJq4ZEpql9BCdCprDmr5GeoKZDKz2eJ2tMv59Gi0f9hIXHCBJcIiqfJaLLweHLgP4ra5bSab-0HOSpLXt6s0ntmQhK1A9KGIClloGZCoyT8GCI1ae2jQTnWMm70000)

## Installation

### Inside Obsidian

`Settings > Third-party plugins > Community Plugins > Browse` and search for `PlantUML`.

### Manually installing the plugin

- Clone this repo
- `npm i` or `yarn` to install dependencies
- `npm run build`  
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/obsidian-plantuml/`.
