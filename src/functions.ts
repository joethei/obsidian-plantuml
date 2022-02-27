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

    replaceNonBreakingSpaces(text: string): string {
        const lines = text.split(/\r?\n/);
        const resultLines: string[] = [];
        if (text.startsWith("@startmindmap")) {
            for (const line of lines) {
                resultLines.push(line.replace(/\s+/g, ' '));
            }
        } else {
            resultLines.push(...lines);
        }
        const result = resultLines.join('\r\n');
        return result.replace(/&nbsp;/gi, " ");
    }

    /**
     * replace all links in the plugin syntax with valid plantuml links to note inside the vault
     * @param text the text, in which to replace all links
     * @param path path of the current file
     */
    replaceLinks(text: string, path: string) : string {
        return text.replace(/\[\[\[([\s\S]*)\]\]\]/g, ((_, args) => {
            const split = args.split("|");
            const file = this.plugin.app.metadataCache.getFirstLinkpathDest(split[0], path);
            //@ts-ignore
            const url = this.plugin.app.getObsidianUrl(file);
            let alias = file.basename;
            if (split[1]) {
                alias = split[1];
            }
            return "[[" + url + " " + alias + "]]";
        }));
    }

    /**
     * get the absolute path on the users computer
     * @param path vault local path
     */
    private getFullPath(path: string) {
        if (path.length === 0) {
            //@ts-ignore
            return this.plugin.app.vault.adapter.getFullPath("");
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        //@ts-ignore
        const folder = this.plugin.app.vault.getDirectParent(file);
        //@ts-ignore
        return this.plugin.app.vault.adapter.getFullPath(folder.path);
    }

    getPath(ctx: MarkdownPostProcessorContext) {
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

    el.insertAdjacentHTML('beforeend', image);
}
