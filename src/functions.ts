import {FileSystemAdapter, parseLinktext, TAbstractFile} from "obsidian";
import PlantumlPlugin from "./main";
import {ProcessorContext} from "./processors/processor";

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
     * @param sourcePath vault path of the file containing the diagram
     * @param filetype
     */
    public replaceLinks(text: string, sourcePath: string, filetype: string) : string {
        return text.replace(/\[\[\[([\s\S]*?)\]\]\]/g, ((_: string, args: string) => {
            const split = args.split("|");
            const alias = split[1];
            const {path, subpath} = parseLinktext(split[0]);
            // links to headings or blocks in the same note have an empty path
            const file = this.plugin.app.metadataCache.getFirstLinkpathDest(path || sourcePath, sourcePath);
            const target = (file ? file.basename : path) + subpath;
            if(filetype === "png") {
                const url = file
                    ? (this.plugin.app as unknown as AppWithObsidianUrl).getObsidianUrl(file) + encodeURIComponent(subpath)
                    : "obsidian://new?vault=" + encodeURIComponent(this.plugin.app.vault.getName()) + "&file=" + encodeURIComponent(path);
                return "[[" + url + " " + (alias || target) + "]]";
            }
            // plantuml uses the first space to separate the url from the label, unless the url is quoted
            const url = /\s/.test(target) ? "\"" + target + "\"" : target;
            return "[[" + url + (alias ? " " + alias : "") + "]]";
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

    public getPath(ctx: ProcessorContext): string {
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
