import { MarkdownPostProcessorContext, request} from "obsidian";
import {DEFAULT_SETTINGS} from "./settings";
import * as plantuml from "plantuml-encoder";
import PlantumlPlugin from "./main";

export class Processors {
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    /**
     * replace all non breaking spaces with actual spaces
     * @param text
     * @private
     */
    private replaceNonBreakingSpaces(text: string) {
        const lines = text.split(/\r?\n/);
        const resultLines: string[] = [];
        for (let line of lines) {
            resultLines.push(line.replace(/\s+$/g, ' '));
        }
        const result = resultLines.join('\r\n');
        console.log(result);
        return result.replace(/&nbsp;/gi, " ");
    }

    public svgProcessor (source: string, el: HTMLElement, _: MarkdownPostProcessorContext): void {
        //make sure url is defined. once the setting gets reset to default, an empty string will be returned by settings
        let url = this.plugin.settings.server_url;
        if (url.length == 0) {
            url = DEFAULT_SETTINGS.server_url;
        }

        const imageUrlBase = url + "/svg/";
        source = this.replaceNonBreakingSpaces(source);

        const encodedDiagram = plantuml.encode(this.plugin.settings.header + "\r\n" + source);

        request({url: imageUrlBase + encodedDiagram, method: 'GET'}).then((value: string) => {
            el.insertAdjacentHTML('beforeend', value);
        }).catch((error: any) => {
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
        const encodedDiagram = plantuml.encode(this.plugin.settings.header + "\r\n" + source);
        console.log(encodedDiagram);

        const img = document.createElement("img");
        img.src = imageUrlBase + encodedDiagram;
        img.useMap = "#" + encodedDiagram;

        //get image map data to support clicking links in diagrams
        const mapUrlBase = url + "/map/";
        request({url: mapUrlBase + encodedDiagram, method: "GET"}).then((value: string) => {
            //only add the map content if actual text is returned(e.g. PicoWeb does not support this)
            if (value.contains("<map>")) {
                el.innerHTML = value;
                el.children[0].setAttr("name", encodedDiagram);
            }
        }).catch((error: any) => {
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

        const encodedDiagram = plantuml.encode(this.plugin.settings.header + "\r\n" + source);

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

    //taken from: https://stackoverflow.com/a/1144788/5589264
    private escapeRegExp(string: string) : string {
        return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    private replaceAll(str: string, find: string, replace: string) : string {
        return str.replace(new RegExp(this.escapeRegExp(find), 'g'), replace);
    }
}
