# PlantUML Support for Obsidian

![Maintenance](https://img.shields.io:/maintenance/yes/2023)
![GitHub manifest.json dynamic (path)](https://img.shields.io/github/manifest-json/minAppVersion/joethei/obsidian-plantuml?label=lowest%20supported%20app%20version)
[![libera manifesto](https://img.shields.io/badge/libera-manifesto-lightgrey.svg)](https://liberamanifesto.com)

Render [PlantUML](https://plantuml.com) Diagrams in [Obsidian](https://obsidian.md)

---

![Demonstration](https://i.joethei.space/c5CVp0aX6h.gif)

This plugin uses either the [PlantUML Online Server](https://plantuml.com/server), or a local
`.jar` file for rendering.

You can also host your own server
([Docker](https://hub.docker.com/r/plantuml/plantuml-server) /
[JEE](https://plantuml.com/de/server) /
[PicoWeb](https://plantuml.com/de/picoweb)) and specify its address in the settings.

Please note that using the local rendering method is not as performant as using a server.

## Usage
Create a fenced codeblock using `plantuml` as the language.
Specify your plantuml code inside.
To generate a diagram with higher resolution use `plantuml-svg`

You can also use `plantuml-ascii` to generate ASCII Art.

Documentation on Plantuml can be found on [plantuml.com](https://plantuml.com/)

### Linking to notes in vault

Since the syntax for weblinks in PlantUML is the same for as for Wikilinks in Obsidian,
a special syntax is used:
`[[[Your other note]]]`
For the content of such a link refer to the [obisidian documentation](https://help.obsidian.md/How+to/Internal+link).

Normal web links are described [here](https://plantuml.com/de/link)

### Including an `.puml` file
> ⚠️ Only works when using local rendering

This works just as describe in the [official documentation](https://plantuml.com/de/preprocessing#393335a6fd28a804).

### Examples

~~~markdown
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
~~~

results in:

![](http://www.plantuml.com/plantuml/png/SyfFEhH0r-xG0iUSpEJKGmki3Yt8ICt9oUS2yo5IuVbvAQb5EObvAN1PX114ILvgHGbSKW48G08GAP_4ObGfa011NSWMe2X1IA2x6w46oUr0_y6a0000)

~~~markdown
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
~~~

results in:
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


## Known issues
Not all methods of using PlantUML support all different diagrams.
Following are a few known issues.
- ASCII can only ever generate Sequence diagrams
- The PicoWeb server does not support clickable links in png diagrams
- Some languages like chinese are not rendered correctly -> Switch to SVG rendering


## Installation
`Settings > Third-party plugins > Community Plugins > Browse` and search for `PlantUML`.
