/**
 * replace all non-breaking spaces with actual spaces
 * @param text
 * @param path
 */
import {MarkdownPostProcessorContext} from "obsidian";
import PlantumlPlugin from "./main";

export class Replacer {
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    public decodeWhiteSpaces(text: string): string {
        return text.replace(/&nbsp;/gi, " ");
    }

    /**
     * replace all links in the plugin syntax with valid plantuml links to note inside the vault
     * @param text the text, in which to replace all links
     * @param path path of the current file
     * @param filetype
     */
    public replaceLinks(text: string, path: string, filetype: string) : string {
        return text.replace(/\[\[\[([\s\S]*?)\]\]\]/g, ((_, args) => {
            const split = args.split("|");
            const file = this.plugin.app.metadataCache.getFirstLinkpathDest(split[0], path);
            if(!file) {
                return "File with name: " + split[0] + " not found";
            }
            let alias = file.basename;
            if(filetype === "png") {
                //@ts-ignore
                const url = this.plugin.app.getObsidianUrl(file);
                if (split[1]) {
                    alias = split[1];
                }
                return "[[" + url + " " + alias + "]]";
            }
            return "[[" + file.basename + "]]";
        }));
    }

    /**
     * get the absolute path on the users computer
     * @param path vault local path
     */
    public getFullPath(path: string) {
        if (path.length === 0) {
            //@ts-ignore
            return this.plugin.app.vault.adapter.getFullPath("");
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(path);

        if(!file) {
            //@ts-ignore
            return this.plugin.app.vault.adapter.getFullPath("");
        }

        //@ts-ignore
        const folder = this.plugin.app.vault.getDirectParent(file);
        //@ts-ignore
        return this.plugin.app.vault.adapter.getFullPath(folder.path);
    }

    public getPath(ctx: MarkdownPostProcessorContext) {
        return this.getFullPath(ctx ? ctx.sourcePath : '');
    }

}

export function insertImageWithMap(el: HTMLElement, image: string, map: string, encodedDiagram: string) {
    el.empty();

    const img = document.createElement("img");
    if(image.startsWith("http")) {
        img.src = image;
    }else {
        img.src = "data:image/png;base64," + image;
    }
    img.useMap = "#" + encodedDiagram;

    if (map.contains("map")) {
        el.innerHTML = map;
        el.children[0].setAttr("name", encodedDiagram);
    }

    el.appendChild(img);
}

export function insertAsciiImage(el: HTMLElement, image: string) {
    el.empty();

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.appendChild(code);
    code.setText(image);
    el.appendChild(pre);
}

export function insertSvgImage(el: HTMLElement, image: string) {
    el.empty();

    const parser = new DOMParser();
    const svg = parser.parseFromString(image, "image/svg+xml");

    const links = svg.getElementsByTagName("a");
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        link.addClass("internal-link");
    }

    el.insertAdjacentHTML('beforeend', svg.documentElement.outerHTML);


}
