import {MarkdownPostProcessorContext, request} from "obsidian";
import {DEFAULT_SETTINGS} from "../settings";
import * as plantuml from "plantuml-encoder";
import PlantumlPlugin from "../main";
import {Processor} from "./processor";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../functions";

export class ServerProcessor implements Processor {
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    private getUrl(): string {
        const url = this.plugin.settings.server_url;
        return url.length > 0 ? url : DEFAULT_SETTINGS.server_url;
    }

    private isDark(): boolean {
        return activeDocument.body.hasClass('theme-dark');
    }

    svg = async(source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const imageUrlBase = this.getUrl() + (this.isDark() ? "/dsvg/" : "/svg/");
        const encodedDiagram = plantuml.encode(source);

        request({url: imageUrlBase + encodedDiagram, method: 'GET'}).then((value: string) => {
            insertSvgImage(el, value);
        }).catch((error: Error) => {
            if (error)
                console.error(error);
        });
    };

    png = async(source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const url = this.getUrl();
        const imageUrlBase = url + (this.isDark() ? "/dpng/" : "/png/");

        const encodedDiagram = plantuml.encode(source);
        const image = imageUrlBase + encodedDiagram;

        //get image map data to support clicking links in diagrams
        const mapUrlBase = url + "/map/";
        const map = await request({url: mapUrlBase + encodedDiagram, method: "GET"});

        insertImageWithMap(el, image, map, encodedDiagram);
    }

    ascii = async(source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const asciiUrlBase = this.getUrl() + (this.isDark() ? "/dtxt/" : "/txt/");
        const encodedDiagram = plantuml.encode(source);

        const result = await request({url: asciiUrlBase + encodedDiagram});

        if (result.startsWith("�PNG")) {
            const text = activeDocument.createEl("p");
            text.addClass('mod-error')
            text.innerText = "Your configured PlantUML Server does not support ASCII Art";
            el.appendChild(text);
            return;
        }

        insertAsciiImage(el, result);
    }
}
