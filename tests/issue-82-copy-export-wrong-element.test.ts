import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {Menu} from "./mocks/obsidian";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import type {Processor, ProcessorContext} from "../src/processors/processor";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../src/functions";
import {createPlugin, FakePlugin} from "./helpers";

const SOURCE = "@startuml Issue82\nAlice -> Bob\n@enduml";
const CTX: ProcessorContext = {sourcePath: "Notes/Issue 82.md"};
const DIAGRAM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" class="plantuml-diagram" width="200" height="100"><text>Alice</text></svg>';
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="svg-icon lucide-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path></svg>';

/** an overlay button like the zoom button from the issue, added into the block by someone other than the plugin */
function addOverlayButton(el: HTMLElement) {
    const button = el.createDiv({cls: "zoom-button"});
    button.innerHTML = ICON_SVG;
    button.createEl("code", {text: "not the diagram"});
    el.prepend(button);
}

const fakeProcessor: Processor = {
    svg: async (_source, el) => insertSvgImage(el, DIAGRAM_SVG),
    png: async (_source, el) => insertImageWithMap(el, "iVBORw0KGgo=", "", "encoded"),
    ascii: async (_source, el) => insertAsciiImage(el, "Alice -> Bob"),
};

let writeText: ReturnType<typeof vi.fn>;
let write: ReturnType<typeof vi.fn>;

beforeEach(() => {
    writeText = vi.fn(async (_text: string) => undefined);
    write = vi.fn(async (_items: unknown[]) => undefined);
    vi.stubGlobal("navigator", {clipboard: {writeText, write}});
    vi.stubGlobal("ClipboardItem", class {
        constructor(public items: Record<string, Blob>) {}
    });
    // jsdom does not implement innerText
    Object.defineProperty(HTMLElement.prototype, "innerText", {
        configurable: true,
        get(this: HTMLElement) { return this.textContent; },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as {innerText?: string}).innerText;
});

async function render(type: "svg" | "png" | "ascii") {
    const plugin = createPlugin({settings: {exportPath: "/exports/"}, files: [CTX.sourcePath]}) as FakePlugin;
    plugin.serverProcessor = fakeProcessor;
    const processors = new DebouncedProcessors(plugin);
    // jsdom has no canvas, hand the image straight over as a blob
    vi.spyOn(processors, "renderToBlob").mockImplementation((_img, _error, handleBlob) => {
        void handleBlob({type: "image/png", arrayBuffer: async () => new ArrayBuffer(3)} as Blob);
    });

    const el = document.body.createDiv();
    await processors[type](SOURCE, el, CTX);
    addOverlayButton(el);

    el.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true}));
    const menu = Menu.lastShown;
    expect(menu).not.toBeNull();
    return {plugin, processors, el, menu: menu as Menu};
}

async function click(menu: Menu, title: string) {
    await menu.getItem(title)?.callback();
    // let the (mocked) blob handling settle
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe("issue #82: copy/export use the rendered diagram, not other elements in the block", () => {
    it("copies the diagram svg instead of an overlay icon", async () => {
        const {menu} = await render("svg");

        await click(menu, "Copy diagram");

        expect(writeText).toHaveBeenCalledTimes(1);
        const copied = writeText.mock.calls[0][0] as string;
        expect(copied).toContain("plantuml-diagram");
        expect(copied).not.toContain("lucide-maximize");
    });

    it("exports the diagram svg instead of an overlay icon", async () => {
        const {plugin, menu} = await render("svg");

        await click(menu, "Export diagram");

        expect(plugin.app.vault.create).toHaveBeenCalledTimes(1);
        const [path, data] = vi.mocked(plugin.app.vault.create).mock.calls[0] as unknown as [string, string];
        expect(path).toBe("/exports/Issue82.svg");
        expect(data).toContain("plantuml-diagram");
        expect(data).not.toContain("lucide-maximize");
    });

    it("only copies the png image for png diagrams", async () => {
        const {menu} = await render("png");

        await click(menu, "Copy diagram");

        expect(write).toHaveBeenCalledTimes(1);
        expect(writeText).not.toHaveBeenCalled();
    });

    it("only exports the png image for png diagrams", async () => {
        const {plugin, menu} = await render("png");

        await click(menu, "Export diagram");

        expect(plugin.app.vault.createBinary).toHaveBeenCalledTimes(1);
        expect(vi.mocked(plugin.app.vault.createBinary).mock.calls[0][0]).toBe("/exports/Issue82.png");
        expect(plugin.app.vault.create).not.toHaveBeenCalled();
    });

    it("copies and exports only the ascii art for ascii diagrams", async () => {
        const {plugin, menu} = await render("ascii");

        await click(menu, "Copy diagram");
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText.mock.calls[0][0]).toBe("Alice -> Bob");

        await click(menu, "Export diagram");
        expect(plugin.app.vault.create).toHaveBeenCalledTimes(1);
        expect(vi.mocked(plugin.app.vault.create).mock.calls[0]).toEqual(["/exports/Issue82.txt", "Alice -> Bob"]);
    });
});

describe("issue #82: png diagrams can be turned into a blob for copy/export", () => {
    it("draws the image on a detached canvas", async () => {
        vi.stubGlobal("Image", class extends EventTarget {
            crossOrigin = "";
            width = 10;
            height = 5;
            set src(_src: string) {
                setTimeout(() => this.dispatchEvent(new Event("load")), 0);
            }
        });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            fillRect: vi.fn(),
            drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
        const blob = new Blob(["png"], {type: "image/png"});
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(blob));
        const processors = new DebouncedProcessors(createPlugin());
        const handleBlob = vi.fn(async (_blob: Blob) => undefined);
        const errors: unknown[] = [];
        const onError = (event: ErrorEvent) => {
            errors.push(event.error);
            event.preventDefault();
        };
        window.addEventListener("error", onError);

        try {
            processors.renderToBlob(document.createElement("img"), "error", handleBlob);
            await new Promise(resolve => setTimeout(resolve, 10));
        } finally {
            window.removeEventListener("error", onError);
        }

        expect(errors).toEqual([]);
        expect(handleBlob).toHaveBeenCalledWith(blob);
    });
});
