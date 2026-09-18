import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {Menu} from "obsidian";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {insertSvgImage, serializeSvg} from "../src/functions";
import type {Processor} from "../src/processors/processor";
import {createPlugin} from "./helpers";

const SOURCE = "@startuml Issue 60\nAlice -> Bob : a<U+00A0>b\n@enduml";

// trimmed down PlantUML output: `<U+00A0>`/`&#160;` in the source are emitted as a raw no-break space
const SVG = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 100 50">'
    + '<g><text x="10" y="20">a b</text><text x="10" y="40">c&#160;&#160;d</text>'
    + '<a href="Target" target="_top" xlink:href="Target"><text x="50" y="20">link</text></a></g></svg>';

const writeText = vi.fn(async (_text: string) => undefined);

async function renderDiagram() {
    const plugin = createPlugin({settings: {exportPath: "/Exports/"}});
    plugin.serverProcessor = {
        svg: async (_source: string, el: HTMLElement) => insertSvgImage(el, SVG),
    } as unknown as Processor;
    const el = document.body.createDiv();

    await new DebouncedProcessors(plugin).svg(SOURCE, el, {sourcePath: "Note.md"});
    el.dispatchEvent(new MouseEvent("contextmenu"));

    return {plugin, el, menu: Menu.lastShown as Menu};
}

function expectValidSvgDocument(xml: string) {
    const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
    const texts = Array.from(doc.getElementsByTagName("text")).map(text => text.textContent);
    expect(texts).toEqual(["a b", "c  d", "link"]);
    expect(doc.getElementsByTagName("a")[0].getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("Target");
}

describe("issue #60: copied/exported svg is a valid standalone svg file", () => {
    beforeEach(() => {
        Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
    });

    afterEach(() => {
        Reflect.deleteProperty(navigator, "clipboard");
    });

    it("serializeSvg produces XML without HTML-only entities", () => {
        const el = document.body.createDiv();
        insertSvgImage(el, SVG);

        const xml = serializeSvg(el.querySelector("svg"));

        expect(xml).not.toContain("&nbsp;");
        expectValidSvgDocument(xml);
    });

    it("exports the diagram as a valid svg, keeping no-break spaces", async () => {
        const {plugin, menu} = await renderDiagram();

        await menu.getItem("Export diagram").callback();

        expect(plugin.app.vault.create).toHaveBeenCalledTimes(1);
        const [path, data] = vi.mocked(plugin.app.vault.create).mock.calls[0] as unknown as [string, string];
        expect(path).toBe("/Exports/Issue 60.svg");
        expect(data).not.toContain("&nbsp;");
        expectValidSvgDocument(data);
    });

    it("copies the diagram as a valid svg, keeping no-break spaces", async () => {
        const {menu} = await renderDiagram();

        await menu.getItem("Copy diagram").callback();

        expect(writeText).toHaveBeenCalledTimes(1);
        expectValidSvgDocument(writeText.mock.calls[0][0]);
    });
});
