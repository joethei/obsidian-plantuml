import {request, requestUrl} from "obsidian";
import {DEFAULT_SETTINGS} from "../settings";
import * as plantuml from "plantuml-encoder";
import PlantumlPlugin from "../main";
import {Processor, ProcessorContext} from "./processor";
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

    private insertError(el: HTMLElement, message: string) {
        el.empty();
        const text = el.createEl("p", {text: message});
        text.addClass('mod-error');
    }

    // the server answers diagrams containing errors with a 400 and a rendering of the error, so keep the body
    private async getText(url: string): Promise<string> {
        const response = await requestUrl({url, method: 'GET', throw: false});
        return response.text;
    }

    svg = async(source: string, el: HTMLElement, _: ProcessorContext) => {
        const imageUrlBase = this.getUrl() + (this.isDark() ? "/dsvg/" : "/svg/");
        const encodedDiagram = plantuml.encode(source);

        let result: string;
        try {
            result = await this.getText(imageUrlBase + encodedDiagram);
        } catch (error) {
            console.error(error);
            this.insertError(el, "Could not reach the PlantUML server");
            return;
        }

        if (!result.contains("<svg")) {
            this.insertError(el, "The PlantUML server did not return a diagram");
            return;
        }

        insertSvgImage(el, result);
    };

    png = async(source: string, el: HTMLElement, _: ProcessorContext) => {
        const url = this.getUrl();
        const imageUrlBase = url + (this.isDark() ? "/dpng/" : "/png/");

        const encodedDiagram = plantuml.encode(source);
        const image = imageUrlBase + encodedDiagram;

        //get image map data to support clicking links in diagrams
        const mapUrlBase = url + "/map/";
        let map: string;
        try {
            map = await request({url: mapUrlBase + encodedDiagram, method: "GET"});
        } catch (error) {
            console.error(error);
            this.insertError(el, "Could not reach the PlantUML server");
            return;
        }

        insertImageWithMap(el, image, map, encodedDiagram);
    }

    ascii = async(source: string, el: HTMLElement, _: ProcessorContext) => {
        const asciiUrlBase = this.getUrl() + (this.isDark() ? "/dtxt/" : "/txt/");
        const encodedDiagram = plantuml.encode(source);

        let result: string;
        try {
            result = await this.getText(asciiUrlBase + encodedDiagram);
        } catch (error) {
            console.error(error);
            this.insertError(el, "Could not reach the PlantUML server");
            return;
        }

        if (result.startsWith("�PNG")) {
            this.insertError(el, "Your configured PlantUML Server does not support ASCII Art");
            return;
        }

        insertAsciiImage(el, result);
    }
}
