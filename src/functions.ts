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
     * add the header lines to the diagram, PlantUML ignores everything before `@startxxx`,
     * so they are inserted after it, or at the top if the diagram does not have a start tag.
     * @param text the diagram source
     * @param headers the headers to insert, empty ones are skipped
     */
    public insertHeaders(text: string, ...headers: string[]): string {
        const header = headers.filter(value => value.trim().length > 0).join("\n");
        if (header.length === 0) {
            return text;
        }
        if (!/^[ \t]*@start/m.test(text)) {
            return header + "\n" + text;
        }
        return text.replace(/^[ \t]*@start.*$/gm, (start: string) => start + "\n" + header);
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

/**
 * whether a link target is an url with a scheme (https:, mailto:, obsidian:, ...) instead of a note in the vault
 */
function isExternalUrl(href: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(href);
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
        const href = link.getAttribute("href") ?? link.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
        if (isExternalUrl(href)) {
            link.addClass("external-link");
            link.setAttr("target", "_blank");
            link.setAttr("rel", "noopener");
        } else {
            link.addClass("internal-link");
        }
    }

    el.appendChild(activeDocument.importNode(svg.documentElement, true));


}

/**
 * serialize the svg as a standalone XML document.
 * outerHTML uses HTML serialization, which emits entities like &nbsp; that are not valid in XML
 */
export function serializeSvg(svg: SVGElement): string {
    return new XMLSerializer().serializeToString(svg);
}
