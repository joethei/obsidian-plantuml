import {FileSystemAdapter, TAbstractFile} from "obsidian";
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
            const linkText = split[0];
            const file = this.plugin.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
            if(filetype === "png") {
                const url = file
                    ? (this.plugin.app as unknown as AppWithObsidianUrl).getObsidianUrl(file)
                    : "obsidian://new?vault=" + encodeURIComponent(this.plugin.app.vault.getName()) + "&file=" + encodeURIComponent(linkText);
                const alias = split[1] || (file ? file.basename : linkText);
                return "[[" + url + " " + alias + "]]";
            }
            return "[[" + (file ? file.basename : linkText) + "]]";
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
            scaleImageMap(img, cloned);
        }
    }
}

/**
 * image map coordinates are in pixels of the original image,
 * keep them in sync with the size the image is actually displayed at
 * @param img the image the map belongs to
 * @param map the map element
 */
function scaleImageMap(img: HTMLImageElement, map: Element) {
    const areas = Array.from(map.querySelectorAll("area"));
    const coords = areas.map(area => area.getAttribute("coords") ?? "");

    const scale = () => {
        if (!img.naturalWidth || !img.width) return;
        const factor = img.width / img.naturalWidth;
        areas.forEach((area, i) => {
            area.setAttr("coords", coords[i].split(",").map(coord => Math.round(parseFloat(coord) * factor)).join(","));
        });
    };

    img.addEventListener("load", scale);
    new ResizeObserver(scale).observe(img);
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

    const svgEl = activeDocument.importNode(svg.documentElement, true);
    svgEl.addClass("puml-svg");
    el.appendChild(svgEl);
}
