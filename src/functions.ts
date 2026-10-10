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

/**
 * whether a link target is an url with a scheme (https:, mailto:, obsidian:, ...) instead of a note in the vault
 */
function isExternalUrl(href: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * get the link text of a link to a note in this vault inside a rendered diagram.
 * png image maps link to obsidian:// urls, svg links contain the link text itself.
 * @param link the clicked `a` or `area` element
 * @param vaultName name of the current vault
 * @return the link text, or null if the link does not point to a note in this vault
 */
export function getInternalLinkText(link: Element, vaultName: string): string | null {
    const href = link.getAttribute("href") ?? link.getAttribute("xlink:href");
    if (!href || href.startsWith("#")) return null;

    const obsidianUrl = href.match(/^obsidian:\/\/(open|new)\?(.*)$/);
    if (obsidianUrl) {
        const params = new URLSearchParams(obsidianUrl[2]);
        if (params.get("vault") !== vaultName) return null;
        return params.get("file");
    }

    //any other scheme (http:, mailto:, ...) is an external link
    if (isExternalUrl(href)) return null;

    try {
        return decodeURIComponent(href);
    } catch {
        return href;
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
        const href = link.getAttribute("href") ?? link.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
        if (isExternalUrl(href)) {
            link.addClass("external-link");
            link.setAttr("target", "_blank");
            link.setAttr("rel", "noopener");
        } else {
            link.addClass("internal-link");
        }
    }

    const svgEl = activeDocument.importNode(svg.documentElement, true);
    svgEl.addClass("puml-svg");
    el.appendChild(svgEl);
}

/**
 * serialize the svg as a standalone XML document.
 * outerHTML uses HTML serialization, which emits entities like &nbsp; that are not valid in XML
 */
export function serializeSvg(svg: SVGElement): string {
    return new XMLSerializer().serializeToString(svg);
}

const CAPTION = /^\s*caption(?:\s*:\s*|\s+)(.*?)\s*$/i;
// creole and HTML markup, links, escapes and preprocessor variables or calls, only PlantUML renders those
const NOT_PLAIN = /\*\*|\/\/|""|__|--|~~|<\/?[a-z]|\[\[|\$\w|%\w+\(|\\[^n]/i;
// the lines of multi-line notes, legends, titles, headers and footers are text, not commands
const TEXT_START = /^\s*(?:[rh]?note\b(?!.*[:"])|legend\b|ref\s+over\b(?!.*:)|(?:(?:left|right|center)\s+)?(?:title|header|footer)\s*$)/i;
const TEXT_END = /^\s*end\s*[rh]?(?:note|legend|ref|title|header|footer)\b/i;
// whether a caption in there is used depends on the preprocessor
const PREPROCESSOR_START = /^\s*!(?:if|ifdef|ifndef|ifexist|procedure|function|unquoted|definelong|while|foreach)\b(?!.*!return)/i;
const PREPROCESSOR_END = /^\s*!(?:endif|end\s*procedure|end\s*function|enddefinelong|endwhile|endfor(?:each)?)\b/i;
// diagrams whose lines are data, like a `caption:` key in YAML
const DATA_DIAGRAM = /^\s*@start(?:yaml|json|ditaa|math|latex)\b/i;

/**
 * take the `caption` out of the diagram source, so it can be shown below the diagram instead of inside the image.
 * only plain text captions on the top level of the first page are taken, not those in blocks, comments,
 * notes or preprocessor branches, and not those with markup only PlantUML renders.
 * all of them are removed, as PlantUML shows the last one, unless that one is left to PlantUML.
 * @return the source without the caption lines and the caption, `\n` in it is turned into a line break
 */
export function extractCaption(source: string): {source: string, caption: string | null} {
    const lines = source.split("\n");
    const captions: {index: number, text: string}[] = [];
    let depth = 0;
    let preprocessor = 0;
    let block: "comment" | "text" | "style" | null = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (block === "comment") {
            if (line.includes("'/")) block = null;
            continue;
        }
        if (block === "text") {
            if (TEXT_END.test(line)) block = null;
            continue;
        }
        if (block === "style") {
            if (/<\/style>/i.test(line)) block = null;
            continue;
        }
        if (DATA_DIAGRAM.test(line)) return {source, caption: null};
        if (/^\s*(?:@end|newpage\b)/i.test(line)) break;
        if (/^\s*'/.test(line)) continue;
        if (/^\s*\/'/.test(line)) {
            if (!line.trim().endsWith("'/")) block = "comment";
            continue;
        }
        if (/^\s*<style>/i.test(line)) {
            if (!/<\/style>/i.test(line)) block = "style";
            continue;
        }
        if (PREPROCESSOR_START.test(line)) {
            preprocessor++;
            continue;
        }
        if (PREPROCESSOR_END.test(line)) {
            preprocessor = Math.max(0, preprocessor - 1);
            continue;
        }
        if (depth === 0 && preprocessor === 0) {
            const caption = CAPTION.exec(line);
            if (caption) {
                captions.push({index, text: caption[1]});
                continue;
            }
            if (TEXT_START.test(line)) {
                block = "text";
                continue;
            }
        }
        depth = Math.max(0, depth + (line.split("{").length - 1) - (line.split("}").length - 1));
    }

    const last = captions[captions.length - 1];
    if (!last || last.text.length === 0 || NOT_PLAIN.test(last.text)) return {source, caption: null};
    for (const {index} of captions) lines[index] = "";
    return {source: lines.join("\n"), caption: last.text.replace(/\\n/g, "\n")};
}

let captionCount = 0;

/**
 * show the caption below the diagram, like image captions.
 * the processors empty the element on every render, so this runs after each render.
 */
export function insertCaption(el: HTMLElement, caption: string | null | undefined) {
    el.querySelector(":scope > .puml-caption")?.remove();
    if (!caption) {
        if (el.hasClass("puml-figure")) {
            el.removeClass("puml-figure");
            el.removeAttribute("role");
            el.removeAttribute("aria-labelledby");
        }
        return;
    }
    // not aria-label, Obsidian shows that as tooltip
    const id = `puml-caption-${++captionCount}`;
    el.addClass("puml-figure");
    el.setAttr("role", "figure");
    el.setAttr("aria-labelledby", id);
    el.createDiv({cls: "puml-caption", text: caption, attr: {id}});
}

export function insertErrorMessage(el: HTMLElement, error: unknown) {
    el.empty();

    const container = el.createDiv({cls: "puml-error"});
    container.createEl("p", {text: "PlantUML diagram could not be rendered", cls: "mod-error"});
    container.createEl("pre").createEl("code", {text: error instanceof Error ? error.message : `${error as string}`});
}
