import {MarkdownPostProcessorContext, request} from "obsidian";
import {DEFAULT_SETTINGS} from "./settings";
import * as plantuml from "plantuml-encoder";
import PlantumlPlugin from "./main";

export class Processors {
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    private async localProcessor(source: string, type: string) : Promise<string> {
        if(this.plugin.local && this.plugin.settings.localJar) {
            return this.plugin.local.generateLocalImage(source, type);
        }
        return "";
    }

    /**
     * replace all non-breaking spaces with actual spaces
     * @param text
     * @private
     */
    private replaceNonBreakingSpaces(text: string) {
        const lines = text.split(/\r?\n/);
        const resultLines: string[] = [];
        if(text.startsWith("@startmindmap")) {
            for (const line of lines) {
                resultLines.push(line.replace(/\s+/g, ' '));
            }
        }else {
            resultLines.push(...lines);
        }
        const result = resultLines.join('\r\n');
        return result.replace(/&nbsp;/gi, " ");
    }

    public svgProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext): Promise<void> => {
        //make sure url is defined. once the setting gets reset to default, an empty string will be returned by settings
        let url = this.plugin.settings.server_url;
        if (url.length == 0) {
            url = DEFAULT_SETTINGS.server_url;
        }

        const imageUrlBase = url + "/svg/";
        source = this.replaceNonBreakingSpaces(source);
        source = this.plugin.settings.header + "\r\n" + source;

        const local = await this.localProcessor(source, "svg");
        if(local !== "") {
            el.insertAdjacentHTML('beforeend', local);
            return;
        }

        const encodedDiagram = plantuml.encode(source);

        request({url: imageUrlBase + encodedDiagram, method: 'GET'}).then((value: string) => {
            el.insertAdjacentHTML('beforeend', value);
        }).catch((error: Error) => {
            if(error)
                console.error(error);
        });
    }

    public imageProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext): Promise<void> => {
        //make sure url is defined. once the setting gets reset to default, an empty string will be returned by settings
        let url = this.plugin.settings.server_url;
        if (url.length == 0) {
            url = DEFAULT_SETTINGS.server_url;
        }

        const imageUrlBase = url + "/png/";
        source = this.replaceNonBreakingSpaces(source);
        source = this.plugin.settings.header + "\r\n" + source;

        const encodedDiagram = plantuml.encode(source);

        const local = await this.localProcessor(source, "png");
        if(local !== "") {
            const img = document.createElement("img");
            img.src = "data:image/png;base64," + local;
            img.useMap = "#" + encodedDiagram;

            const map = await this.plugin.local.generateLocalMap(source);
            if(map.contains("map")) {
                el.innerHTML = map;
                el.children[0].setAttr("name", encodedDiagram);
            }

            el.appendChild(img);

            return;
        }

        const img = document.createElement("img");
        img.src = imageUrlBase + encodedDiagram;
        img.useMap = "#" + encodedDiagram;

        //get image map data to support clicking links in diagrams
        const mapUrlBase = url + "/map/";
        request({url: mapUrlBase + encodedDiagram, method: "GET"}).then((value: string) => {
            //only add the map content if actual text is returned(e.g. PicoWeb does not support this)
            if (value.contains("map")) {
                el.innerHTML = value;
                el.children[0].setAttr("name", encodedDiagram);
            }
        }).catch((error: Error) => {
            if(error)
                console.error(error);
        }).finally(() => {
            el.appendChild(img);
        });
    }

    public asciiProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext): Promise<void> => {
        //make sure url is defined, once the setting gets reset to default, an empty string will be returned by settings
        let url = this.plugin.settings.server_url;
        if (url.length == 0) {
            url = DEFAULT_SETTINGS.server_url;
        }
        const asciiUrlBase = url + "/txt/";
        source = this.replaceNonBreakingSpaces(source);
        source = this.plugin.settings.header + "\r\n" + source;

        const local = await this.localProcessor(source, "txt");
        if(local !== "") {
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            pre.appendChild(code);
            code.setText(local);
            el.appendChild(pre);
            return;
        }

        const encodedDiagram = plantuml.encode(source);

        const result = await request({url: asciiUrlBase + encodedDiagram});

        if (result.startsWith("�PNG")) {
            const text = document.createElement("p");
            text.style.color = "red";
            text.innerText = "Your configured PlantUML Server does not support ASCII Art";
            el.appendChild(text);
            return;
        }

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        pre.appendChild(code);
        code.setText(result);
        el.appendChild(pre);
    };
}
