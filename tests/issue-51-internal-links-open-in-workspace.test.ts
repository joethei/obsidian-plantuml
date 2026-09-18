import {describe, expect, it, vi} from "vitest";
import {Keymap} from "obsidian";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {getInternalLinkText, insertImageWithMap, insertSvgImage} from "../src/functions";
import type {Processor} from "../src/processors/processor";
import {createPlugin} from "./helpers";

const SOURCE_PATH = "Folder/Diagram.md";

/**
 * a processor that renders the replaced source like a PlantUML server would:
 * png links end up in an image map, svg links as `<a href>`
 */
function fakeProcessor(): Processor {
    const links = (source: string) => [...source.matchAll(/\[\[(\S+?)(?: ([^\]]*))?\]\]/g)];
    return {
        png: async (source, el) => {
            const areas = links(source).map(([, href]) => `<area shape="rect" coords="0,0,10,10" href="${href}">`);
            insertImageWithMap(el, "iVBORw0KGgo=", `<map id="plantuml_map">${areas.join("")}</map>`, "ENCODED");
        },
        svg: async (source, el) => {
            const anchors = links(source).map(([, href]) => `<a href="${href}" xlink:href="${href}"><text>link</text></a>`);
            insertSvgImage(el, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${anchors.join("")}</svg>`);
        },
        ascii: async () => undefined,
    };
}

async function render(type: "png" | "svg", source: string, files = ["Notes/Welcome.md"]) {
    const plugin = createPlugin({files, vaultName: "My Vault", settings: {debounce: 0}});
    plugin.serverProcessor = fakeProcessor();
    const processors = new DebouncedProcessors(plugin);
    const el = document.body.createDiv();
    await processors[type](source, el, {sourcePath: SOURCE_PATH});
    return {plugin, el};
}

function click(target: Element, init: MouseEventInit = {}) {
    const event = new MouseEvent("click", {bubbles: true, cancelable: true, ...init});
    target.dispatchEvent(event);
    return event;
}

describe("issue #51: internal links in diagrams open inside the current workspace", () => {
    it("opens png image map links with openLinkText instead of the obsidian:// url", async () => {
        const {plugin, el} = await render("png", "A -> B [[[Welcome]]]");
        const area = el.querySelector("area");
        expect(area?.getAttribute("href")).toMatch(/^obsidian:\/\/open\?/);

        const event = click(area);

        expect(event.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Notes/Welcome.md", SOURCE_PATH, false);
    });

    it("honours modifier keys to open the note in a new tab", async () => {
        const {plugin, el} = await render("png", "A -> B [[[Welcome|welcome]]]");
        vi.mocked(Keymap.isModEvent).mockReturnValueOnce("tab");

        click(el.querySelector("area"), {ctrlKey: true});

        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Notes/Welcome.md", SOURCE_PATH, "tab");
    });

    it("opens middle clicks in a new tab, ignores right clicks", async () => {
        const {plugin, el} = await render("png", "A -> B [[[Welcome]]]");
        const area = el.querySelector("area");
        vi.mocked(Keymap.isModEvent).mockReturnValueOnce("tab");

        area.dispatchEvent(new MouseEvent("auxclick", {bubbles: true, cancelable: true, button: 1}));
        area.dispatchEvent(new MouseEvent("auxclick", {bubbles: true, cancelable: true, button: 2}));

        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledTimes(1);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Notes/Welcome.md", SOURCE_PATH, "tab");
    });

    it("opens links to notes that don't exist yet with openLinkText, so they get created in this vault", async () => {
        const {plugin, el} = await render("png", "A -> B [[[Missing Note]]]", []);

        const event = click(el.querySelector("area"));

        expect(event.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Missing Note", SOURCE_PATH, false);
    });

    it("opens svg links with openLinkText", async () => {
        const {plugin, el} = await render("svg", "A -> B [[[Welcome]]]");

        const event = click(el.querySelector("svg text"));

        expect(event.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Welcome", SOURCE_PATH, false);
    });

    it("leaves external links and links to other vaults alone", async () => {
        const {plugin, el} = await render("png", "A -> B [[https://example.com]] [[obsidian://open?vault=Other&file=Note]]");
        const prevented: boolean[] = [];
        document.body.addEventListener("click", (event) => {
            prevented.push(event.defaultPrevented);
            event.preventDefault();
        });

        el.querySelectorAll("area").forEach(area => click(area));

        expect(prevented).toEqual([false, false]);
        expect(plugin.app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it("triggers hover-link on internal links for page previews", async () => {
        const {plugin, el} = await render("png", "A -> B [[[Welcome]]]");
        const area = el.querySelector("area");
        const outerHover = vi.fn();
        document.body.addEventListener("mouseover", outerHover);

        area.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));

        // reading view would otherwise show a second preview for svg links with the internal-link class
        expect(outerHover).not.toHaveBeenCalled();
        expect(plugin.app.workspace.trigger).toHaveBeenCalledWith("hover-link", expect.objectContaining({
            source: "preview",
            targetEl: area,
            linktext: "Notes/Welcome.md",
            sourcePath: SOURCE_PATH,
        }));
    });
});

describe("getInternalLinkText", () => {
    const link = (href: string) => {
        const a = document.createElement("a");
        a.setAttribute("href", href);
        return a;
    };

    it("extracts the file of obsidian:// urls of the current vault", () => {
        expect(getInternalLinkText(link("obsidian://open?vault=My%20Vault&file=Notes%2FWelcome%20Page.md"), "My Vault")).toBe("Notes/Welcome Page.md");
        expect(getInternalLinkText(link("obsidian://new?vault=My%20Vault&file=New"), "My Vault")).toBe("New");
        expect(getInternalLinkText(link("obsidian://open?vault=Other&file=Welcome"), "My Vault")).toBeNull();
    });

    it("treats scheme-less svg hrefs as link text and ignores external ones", () => {
        expect(getInternalLinkText(link("My%20Note"), "V")).toBe("My Note");
        expect(getInternalLinkText(link("https://example.com"), "V")).toBeNull();
        expect(getInternalLinkText(link("mailto:a@b.c"), "V")).toBeNull();
        expect(getInternalLinkText(link("#top"), "V")).toBeNull();
    });

    it("keeps the heading and block subpaths #68 adds to links", () => {
        expect(getInternalLinkText(link("obsidian://open?vault=V&file=Notes%2FTarget.md%23Heading%20with%20spaces"), "V")).toBe("Notes/Target.md#Heading with spaces");
        expect(getInternalLinkText(link("Target#Heading with spaces"), "V")).toBe("Target#Heading with spaces");
        expect(getInternalLinkText(link("Target#^block-id"), "V")).toBe("Target#^block-id");
    });
});
