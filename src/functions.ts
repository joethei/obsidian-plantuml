import {FileSystemAdapter, MarkdownPostProcessorContext, TAbstractFile} from "obsidian";
import PlantumlPlugin from "./main";

interface VaultWithDirectParent { getDirectParent(file: TAbstractFile): { path: string } | null; }
interface AppWithObsidianUrl { getObsidianUrl(file: unknown): string; }

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
        return text.replace(/\[\[\[([\s\S]*?)\]\]\]/g, ((_: string, args: string) => {
            const split = args.split("|");
            const file = this.plugin.app.metadataCache.getFirstLinkpathDest(split[0], path);
            if(!file) {
                return "File with name: " + split[0] + " not found";
            }
            let alias = file.basename;
            if(filetype === "png") {
                const url = (this.plugin.app as unknown as AppWithObsidianUrl).getObsidianUrl(file);
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
    public getFullPath(path: string): string {
        if (!(this.plugin.app.vault.adapter instanceof FileSystemAdapter)) {
            return;
        }

        if (path.length === 0) {
            return this.plugin.app.vault.adapter.getFullPath("");
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(path);

        if(!file) {
            return this.plugin.app.vault.adapter.getFullPath("");
        }

        const vault = this.plugin.app.vault as unknown as VaultWithDirectParent;
        const folder = vault.getDirectParent(file);
        return this.plugin.app.vault.adapter.getFullPath(folder?.path ?? "");
    }

    public getPath(ctx: MarkdownPostProcessorContext): string {
        return this.getFullPath(ctx ? ctx.sourcePath : '');
    }

}

export function insertImageWithMap(el: HTMLElement, image: string, map: string, encodedDiagram: string) {
    el.empty();

    const img = el.createEl("img");
    if(image.startsWith("http")) {
        img.src = image;
    }else {
        img.src = "data:image/png;base64," + image;
    }
    img.useMap = "#" + encodedDiagram;

    if (map.contains("map")) {
        const parser = new DOMParser();
        const mapDoc = parser.parseFromString(map, 'text/html');
        const mapEl = mapDoc.body.firstChild;
        if (mapEl) {
            const cloned = mapEl.cloneNode(true) as Element;
            cloned.setAttr("name", encodedDiagram);
            el.appendChild(cloned);
        }
    }
}

export function insertAsciiImage(el: HTMLElement, image: string) {
    el.empty();

    const pre = el.createEl("pre");
    const code = pre.createEl("code");
    code.setText(image);
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

    el.appendChild(activeDocument.importNode(svg.documentElement, true));


}
