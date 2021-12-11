# Obsidian PlantUML

![GitHub package.json version](https://img.shields.io/github/package-json/v/joethei/obsidian-plantuml)
![GitHub manifest.json dynamic (path)](https://img.shields.io/github/manifest-json/minAppVersion/joethei/obsidian-plantuml?label=lowest%20supported%20app%20version)
![GitHub](https://img.shields.io/github/license/joethei/obsidian-plantuml)
[![libera manifesto](https://img.shields.io/badge/libera-manifesto-lightgrey.svg)](https://liberamanifesto.com)

Render [PlantUML](https://plantuml.com) Diagrams in [Obsidian](https://obsidian.md)

---

![Demonstration](https://i.joethei.space/c5CVp0aX6h.gif)

This plugin uses the [PlantUML Online Server](https://plantuml.com/server) for rendering.

You can also host your own server
([Docker](https://hub.docker.com/r/plantuml/plantuml-server) /
[JEE](https://plantuml.com/de/server) /
[PicoWeb](https://plantuml.com/de/picoweb)) and specify its address in the settings.

## Usage
Create a fenced codeblock using `plantuml` as the language.
Specify your plantuml code inside.
To generate a diagram with higher resolution use `plantuml-svg`

You can also use `plantuml-ascii` to generate ASCII Art.

Documentation on Plantuml can be found on [plantuml.com](https://plantuml.com/)

<!--
TODO: Test all different combinations, also test with all server variants
## Compatibility

| |PNG|SVG|ASCII|
|---|---|---|---|
|Sequence|✅️|✅|✅|
|Usecase|✅|✅|❌|
|Class|✅|✅|❌|
|Object|✅|✅|❌|
|Component|✅|✅|❌|
|Deployment|✅|✅|❌|
|State|✅|✅|❌|
|Timing|✅|✅|❌|
|JSON|✅|✅|❌
|YAML|✅|✅|❌|
|Network|✅|✅|❌|
|Wireframe|✅|✅|❌|
|Archimate|✅|✅|❌|
|SDL|✅|✅|❌|
|Ditaa|✅|❌|❌|
|Gantt|✅|✅|❌|
|MindMap|✅|✅|❌|
|Word Breakdown|✅|✅|❌|
|Math|✅|✅|❌|
|ERP|✅|✅|❌|
-->


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


## Installation
`Settings > Third-party plugins > Community Plugins > Browse` and search for `PlantUML`.
