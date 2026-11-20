import {MarkdownPostProcessorContext, request, requestUrl} from "obsidian";
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

    //This is an assumption that might not be true for all cases
    private isDockerServer(): boolean{
        return this.plugin.settings.docker_server;
    }

    private getUrl(): string {
        const url = this.plugin.settings.server_url;
        return url.length > 0 ? url : DEFAULT_SETTINGS.server_url;
    }

    private isDark(): boolean {
        return activeDocument.body.hasClass('theme-dark');
    }

    svg = async(source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        //Docker deploys do not serve the dark mode endpoints
        const endpoint = this.isDark()&&!this.isDockerServer()?"/dsvg/":"/svg/"
        const imageUrlBase = this.getUrl() + endpoint;
        const headers = this.isDark()?{"X-Preferred-Color-Mapper": "DARK_MODE"}:{}
        const encodedDiagram = plantuml.encode(source);

        request({
            url: imageUrlBase + encodedDiagram,
            method: 'GET',
            headers
        }).then((value: string) => {
            insertSvgImage(el, value);
        }).catch((error: Error) => {
            if (error)
                console.error(error);
        });
    };

    png = async(source: string, el: HTMLElement, _: ProcessorContext) => {
        const url = this.getUrl();
        //Docker deploys do not serve the dark mode endpoints
        const endpoint = this.isDark()&&!this.isDockerServer()?"/dpng/":"/png/"
        const headers = this.isDark()?{"X-Preferred-Color-Mapper": "DARK_MODE"}:{}
        const imageUrlBase = url + endpoint;
        const encodedDiagram = plantuml.encode(source);

        const response = await requestUrl({
        url: imageUrlBase + encodedDiagram,
        method: "GET",
        headers
        });
        const bytes = new Uint8Array(response.arrayBuffer);
        let binary = "";
        for (const byte of bytes){
            binary += String.fromCharCode(byte);
        }
        const image = btoa(binary);

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
