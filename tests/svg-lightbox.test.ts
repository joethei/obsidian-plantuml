import {readFileSync} from "fs";
import {resolve} from "path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {Keymap, Menu, Notice, ResizeObserverStub} from "obsidian";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {insertSvgImage} from "../src/functions";
import type {Processor} from "../src/processors/processor";
import {registerSvgLightbox} from "../src/svgLightbox";
import {createPlugin} from "./helpers";

const SOURCE_PATH = "Diagrams/Sequence.md";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <title>Sequence flow</title>
    <style>.label { fill: #181818; font-family: sans-serif; font-size: 14px; }</style>
    <script>alert(1)</script>
    <rect width="200" height="100" onclick="alert(1)" />
    <circle cx="180" cy="80" r="10" />
    <a href="Target#Heading"><text class="label" x="10" y="30">Open target</text></a>
    <text class="label" x="10" y="60">Alice</text>
    <a href="https://example.com"><text class="label" x="10" y="90">External</text></a>
</svg>`;

const fakeProcessor: Processor = {
    svg: async (_source, el) => insertSvgImage(el, SVG),
    png: async () => undefined,
    ascii: async () => undefined,
};

let nativeOpen: ReturnType<typeof vi.fn>;
let nativeZoom: ReturnType<typeof vi.fn>;
let nativeClickHandler: (event: MouseEvent) => void;

function createNativeLightbox(source: HTMLImageElement) {
    const ownerDocument = source.ownerDocument;
    const lightbox = ownerDocument.createElement("div");
    lightbox.className = "lightbox";
    const backdrop = ownerDocument.createElement("div");
    backdrop.className = "lightbox-bg";
    const content = ownerDocument.createElement("div");
    content.className = "lightbox-content";
    const media = ownerDocument.createElement("div");
    media.className = "lightbox-media";
    const wrapper = ownerDocument.createElement("div");
    wrapper.className = "media-wrapper";
    const image = ownerDocument.createElement("img");
    image.src = source.src;
    image.alt = source.alt;
    image.title = source.title;
    image.style.transform = "translate(0px, 0px) scale(1)";
    const close = ownerDocument.createElement("button");
    close.className = "modal-close-button";
    close.textContent = "Close";
    wrapper.appendChild(image);
    media.appendChild(wrapper);
    content.appendChild(media);
    content.appendChild(close);
    lightbox.appendChild(backdrop);
    lightbox.appendChild(content);
    ownerDocument.body.appendChild(lightbox);

    const remove = () => lightbox.remove();
    backdrop.addEventListener("click", remove);
    close.addEventListener("click", remove);
    media.addEventListener("click", event => {
        if (event.target !== image) remove();
    });
    const zoom = () => {
        const transform = image.style.transform;
        const translate = transform.match(/translate\([^)]*\)/)?.[0] ?? "translate(0px, 0px)";
        const scale = Number(transform.match(/scale\(([^)]+)\)/)?.[1] ?? "1") + 1;
        nativeZoom();
        image.style.transform = `${translate} scale(${scale})`;
    };
    media.addEventListener("dblclick", event => {
        if (event.target === image) zoom();
    });
    media.addEventListener("wheel", event => {
        if (event.target !== image || !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        zoom();
    });
    return lightbox;
}

beforeEach(() => {
    ResizeObserverStub.instances = [];
    nativeZoom = vi.fn();
    nativeOpen = vi.fn(createNativeLightbox);
    nativeClickHandler = (event: MouseEvent) => {
        if (event.target instanceof HTMLImageElement && event.target.dataset.plantumlLightboxTrigger === "true") {
            nativeOpen(event.target);
        }
    };
    document.addEventListener("click", nativeClickHandler);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
        callback(0);
        return 1;
    });
});

afterEach(() => {
    document.removeEventListener("click", nativeClickHandler);
    vi.restoreAllMocks();
});

async function render(svgText = SVG) {
    const plugin = createPlugin({files: ["Diagrams/Target.md"], settings: {debounce: 0}});
    plugin.serverProcessor = {
        ...fakeProcessor,
        svg: async (_source, el) => insertSvgImage(el, svgText),
    };
    const el = document.body.createDiv({cls: "markdown-preview-view"});
    await new DebouncedProcessors(plugin).svg("A -> B [[[Target#Heading]]]", el, {sourcePath: SOURCE_PATH});
    return {plugin, el, svg: el.querySelector<SVGSVGElement>(":scope > svg") as SVGSVGElement};
}

async function openLightbox() {
    return openLightboxFromSvg(SVG);
}

async function openLightboxFromSvg(svgText: string) {
    const rendered = await render(svgText);
    click(rendered.svg.querySelector("circle") as SVGCircleElement);
    const lightbox = document.querySelector<HTMLElement>(".lightbox") as HTMLElement;
    const clone = lightbox.querySelector<SVGSVGElement>(".plantuml-svg-lightbox-inline") as SVGSVGElement;
    return {...rendered, lightbox, clone};
}

function click(target: Element) {
    const event = new MouseEvent("click", {bubbles: true, cancelable: true, button: 0});
    target.dispatchEvent(event);
    return event;
}

function selectText(element: Element, start: number, end: number) {
    const text = element.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

describe("SVG Lightbox", () => {
    it("keeps the Reading-view SVG inline and opens one native Lightbox with a sanitized inline clone", async () => {
        const {el, svg} = await render();

        expect(svg).not.toBeNull();
        expect(el.querySelector(":scope > img")).toBeNull();
        click(svg.querySelector("circle") as SVGCircleElement);

        expect(nativeOpen).toHaveBeenCalledOnce();
        expect(el.querySelector(":scope > svg")).toBe(svg);
        expect(el.querySelector(":scope > img")).toBeNull();

        const lightbox = document.querySelector<HTMLElement>(".lightbox");
        const nativeImage = lightbox?.querySelector<HTMLImageElement>(".media-wrapper > img");
        const clone = lightbox?.querySelector<SVGSVGElement>(".plantuml-svg-lightbox-inline");
        expect(lightbox?.classList.contains("plantuml-svg-lightbox")).toBe(true);
        expect(lightbox?.querySelector(".lightbox-bg")).not.toBeNull();
        expect(lightbox?.querySelector(".lightbox-media")).not.toBeNull();
        expect(lightbox?.querySelector(".modal-close-button")).not.toBeNull();
        expect(nativeImage?.alt).toBe("PlantUML diagram");
        expect(nativeImage?.title).toBe("Sequence flow");
        expect(nativeImage?.alt).not.toContain("%3Csvg");
        expect(clone).not.toBeNull();
        expect(clone?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
        expect(clone?.querySelector("script")).toBeNull();
        expect(clone?.querySelector("rect")?.hasAttribute("onclick")).toBe(false);
        expect(clone?.querySelector("style")).not.toBeNull();

        click(lightbox?.querySelector(".modal-close-button") as HTMLButtonElement);
        expect(document.querySelector(".lightbox")).toBeNull();
    });

    it("waits for delayed native Lightbox creation", async () => {
        const callbacks: FrameRequestCallback[] = [];
        vi.mocked(window.requestAnimationFrame).mockImplementation(callback => {
            callbacks.push(callback);
            return callbacks.length;
        });
        nativeOpen.mockImplementation(() => undefined);
        const {el, svg} = await render();

        click(svg.querySelector("circle") as SVGCircleElement);
        expect(callbacks).toHaveLength(1);
        callbacks.shift()?.(0);
        expect(callbacks).toHaveLength(1);
        expect(document.querySelector(".plantuml-svg-lightbox-inline")).toBeNull();

        const trigger = el.querySelector<HTMLImageElement>("[data-plantuml-lightbox-trigger]") as HTMLImageElement;
        createNativeLightbox(trigger);
        callbacks.shift()?.(16);

        expect(document.querySelector(".plantuml-svg-lightbox-inline")).not.toBeNull();
        expect(el.querySelector("[data-plantuml-lightbox-trigger]")).toBeNull();
    });

    it("keeps note links clickable without opening the Lightbox", async () => {
        const {plugin, svg} = await render();

        const event = click(svg.querySelector("a text") as SVGTextElement);

        expect(nativeOpen).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Target#Heading", SOURCE_PATH, false);
        expect(document.querySelector(".lightbox")).toBeNull();
    });

    it("rejects encoded unsafe targets in the real sanitized Lightbox click path", async () => {
        const maliciousTargets = [
            "%6a%61%76%61%73%63%72%69%70%74%3aalert(1)",
            "%66%69%6c%65%3a///etc/passwd",
            "%64%61%74%61%3atext/html,unsafe",
            "%6f%62%73%69%64%69%61%6e%3a//open?vault=Test%20Vault&amp;file=Target",
            "%2f%2funsafe.example/path",
            "java%0ascript:alert(1)",
            "%E0%A4%A",
        ];
        const links = maliciousTargets.map((href, index) =>
            `<a id="unsafe-${index}" href="${href}"><text x="10" y="${20 + index * 10}">unsafe-${index}</text></a>`).join("");
        const {plugin, lightbox, clone} = await openLightboxFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">
            <circle cx="190" cy="110" r="5" />
            <a id="safe" href="Folder%2FTarget%23Heading"><text x="10" y="10">safe</text></a>
            ${links}
        </svg>`);
        const anchors = Array.from(clone.querySelectorAll("a"));

        maliciousTargets.forEach((_href, index) => {
            const anchor = anchors[index + 1];
            expect(anchor.hasAttribute("href")).toBe(false);
            click(anchor.querySelector("text") as SVGTextElement);
        });
        expect(plugin.app.workspace.openLinkText).not.toHaveBeenCalled();

        const safe = click(anchors[0].querySelector("text") as SVGTextElement);
        expect(safe.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Folder/Target#Heading", SOURCE_PATH, false);
        expect(lightbox.isConnected).toBe(true);
    });

    it("scopes select-all and copied text to the Lightbox SVG and removes the handlers on close", async () => {
        const outside = document.body.createEl("input");
        outside.value = "Outside";
        outside.focus();
        outside.setSelectionRange(1, 4);
        const focus = vi.spyOn(SVGElement.prototype, "focus");
        const {lightbox, clone} = await openLightbox();
        const selection = window.getSelection();
        const focusedOnInstall = document.activeElement;

        outside.focus();
        outside.setSelectionRange(1, 4);
        const outsideSelectAll = new KeyboardEvent("keydown", {key: "a", ctrlKey: true, bubbles: true, cancelable: true});
        outside.dispatchEvent(outsideSelectAll);
        expect(outsideSelectAll.defaultPrevented).toBe(false);
        expect(outside.selectionStart).toBe(1);
        expect(outside.selectionEnd).toBe(4);

        expect(clone.getAttribute("tabindex")).toBe("0");
        expect(focus).toHaveBeenCalledWith({preventScroll: true});
        expect(focusedOnInstall).toBe(clone);
        for (const modifier of [{ctrlKey: true}, {metaKey: true}]) {
            selection?.removeAllRanges();
            clone.focus();
            const selectAll = new KeyboardEvent("keydown", {
                key: "a",
                ...modifier,
                bubbles: true,
                cancelable: true,
            });
            clone.dispatchEvent(selectAll);

            expect(selectAll.defaultPrevented).toBe(true);
            expect(selection?.rangeCount).toBe(1);
            expect(clone.contains(selection?.anchorNode ?? null) || selection?.anchorNode === clone).toBe(true);
            expect(clone.contains(selection?.focusNode ?? null) || selection?.focusNode === clone).toBe(true);
        }

        const setData = vi.fn();
        const copy = new Event("copy", {bubbles: true, cancelable: true}) as ClipboardEvent;
        Object.defineProperty(copy, "clipboardData", {value: {setData}});
        window.dispatchEvent(copy);
        expect(copy.defaultPrevented).toBe(true);
        expect(setData).toHaveBeenCalledWith("text/plain", "Open target\nAlice\nExternal");

        const outsideText = document.body.createEl("p", {text: "Outside"});
        const outsideRange = document.createRange();
        outsideRange.selectNodeContents(outsideText);
        selection?.removeAllRanges();
        selection?.addRange(outsideRange);
        const outsideCopy = new Event("copy", {bubbles: true, cancelable: true}) as ClipboardEvent;
        const outsideSetData = vi.fn();
        Object.defineProperty(outsideCopy, "clipboardData", {value: {setData: outsideSetData}});
        window.dispatchEvent(outsideCopy);
        expect(outsideCopy.defaultPrevented).toBe(false);
        expect(outsideSetData).not.toHaveBeenCalled();

        const nativeImage = lightbox.querySelector<HTMLImageElement>(".media-wrapper > img") as HTMLImageElement;
        click(lightbox.querySelector(".modal-close-button") as HTMLButtonElement);
        await Promise.resolve();
        expect(clone.isConnected).toBe(false);

        const selectionBeforeDetachedKeydown = {
            anchorNode: selection?.anchorNode,
            anchorOffset: selection?.anchorOffset,
            focusNode: selection?.focusNode,
            focusOffset: selection?.focusOffset,
            rangeCount: selection?.rangeCount,
            text: selection?.toString(),
        };
        const detachedSelectAll = new KeyboardEvent("keydown", {key: "a", ctrlKey: true, bubbles: true, cancelable: true});
        clone.dispatchEvent(detachedSelectAll);
        expect(detachedSelectAll.defaultPrevented).toBe(false);
        expect({
            anchorNode: selection?.anchorNode,
            anchorOffset: selection?.anchorOffset,
            focusNode: selection?.focusNode,
            focusOffset: selection?.focusOffset,
            rangeCount: selection?.rangeCount,
            text: selection?.toString(),
        }).toEqual(selectionBeforeDetachedKeydown);

        const afterClose = new KeyboardEvent("keydown", {key: "a", ctrlKey: true, bubbles: true, cancelable: true});
        window.dispatchEvent(afterClose);
        expect(afterClose.defaultPrevented).toBe(false);

        const transformAfterClose = clone.style.transform;
        nativeImage.style.transform = "translate(50px, 25px) scale(4)";
        await Promise.resolve();
        expect(clone.style.transform).toBe(transformAfterClose);
        expect(ResizeObserverStub.instances.every(observer => observer.targets.length === 0)).toBe(true);
    });

    it.each(["pointerdown", "mousedown"])("snapshots the selection on right-button %s for one context menu", async (downEvent) => {
        const writeText = vi.fn(async (_text: string) => undefined);
        Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
        const {lightbox, clone} = await openLightbox();
        const nativeImage = lightbox.querySelector<HTMLImageElement>(".media-wrapper > img") as HTMLImageElement;
        const alice = Array.from(clone.querySelectorAll("text")).find(text => text.textContent === "Alice") as SVGTextElement;
        selectText(alice, 1, 4);

        nativeImage.dispatchEvent(new MouseEvent(downEvent, {bubbles: true, cancelable: true, button: 2}));
        window.getSelection()?.removeAllRanges();
        nativeImage.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, button: 2}));

        const firstMenu = Menu.lastShown as Menu;
        expect(firstMenu.getItem("Copy selected text")).toBeDefined();
        expect(firstMenu.getItem("Copy all diagram text")).toBeDefined();
        await firstMenu.getItem("Copy selected text")?.callback();
        expect(writeText).toHaveBeenCalledWith("lic");
        expect(Notice.messages).toContain("Copied selected diagram text");

        nativeImage.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, button: 2}));
        const secondMenu = Menu.lastShown as Menu;
        expect(secondMenu).not.toBe(firstMenu);
        expect(firstMenu.closed).toBe(true);

        click(lightbox.querySelector(".modal-close-button") as HTMLButtonElement);
        await Promise.resolve();
        expect(secondMenu.closed).toBe(true);
    });

    it("reports clipboard rejection from context-menu actions", async () => {
        const writeText = vi.fn(async (_text: string) => { throw new Error("denied"); });
        Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
        const {lightbox} = await openLightbox();
        const nativeImage = lightbox.querySelector<HTMLImageElement>(".media-wrapper > img") as HTMLImageElement;

        nativeImage.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, button: 2}));
        const menu = Menu.lastShown as Menu;
        await menu.getItem("Copy all diagram text")?.callback();

        expect(writeText).toHaveBeenCalledWith("Open target\nAlice\nExternal");
        expect(Notice.messages).toContain("Failed to copy diagram text");
    });

    it("lets the native image own click, zoom, and pan transforms while the clone follows", async () => {
        const {plugin, lightbox, clone} = await openLightbox();
        const nativeImage = lightbox.querySelector<HTMLImageElement>(".media-wrapper > img") as HTMLImageElement;

        click(nativeImage);
        expect(lightbox.isConnected).toBe(true);
        expect(nativeZoom).not.toHaveBeenCalled();

        nativeImage.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true, button: 0}));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(nativeZoom).toHaveBeenCalledOnce();
        expect(clone.style.transform).toContain("scale(2)");

        nativeImage.style.transform = "translate(25px, 15px) scale(2)";
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(clone.style.transform).toBe(nativeImage.style.transform);

        nativeImage.dispatchEvent(new WheelEvent("wheel", {bubbles: true, cancelable: true, ctrlKey: true, deltaY: -10}));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(nativeZoom).toHaveBeenCalledTimes(2);
        expect(nativeImage.style.transform).toBe("translate(25px, 15px) scale(3)");
        expect(clone.style.transform).toBe(nativeImage.style.transform);

        const alice = Array.from(clone.querySelectorAll("text")).find(text => text.textContent === "Alice") as SVGTextElement;
        click(alice);
        expect(lightbox.isConnected).toBe(true);

        const internal = click(Array.from(clone.querySelectorAll("text")).find(text => text.textContent === "Open target") as SVGTextElement);
        expect(internal.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Target#Heading", SOURCE_PATH, false);

        const external = click(Array.from(clone.querySelectorAll("text")).find(text => text.textContent === "External") as SVGTextElement);
        expect(external.defaultPrevented).toBe(false);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledTimes(1);

        click(lightbox.querySelector(".lightbox-media") as HTMLElement);
        expect(lightbox.isConnected).toBe(false);
    });

    it("routes middle-clicked Lightbox links through the current workspace", async () => {
        const {plugin, clone} = await openLightbox();
        vi.mocked(Keymap.isModEvent).mockReturnValueOnce("tab");
        const target = Array.from(clone.querySelectorAll("text")).find(text => text.textContent === "Open target") as SVGTextElement;
        const down = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, button: 1});
        Object.defineProperty(down, "pointerId", {value: 1});
        const event = new MouseEvent("auxclick", {bubbles: true, cancelable: true, button: 1});

        target.dispatchEvent(down);
        target.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Target#Heading", SOURCE_PATH, "tab");
    });

    it("uses each owner document's Element constructor and avoids duplicate registration", async () => {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const ownerDocument = iframe.contentDocument as Document;
        const ownerWindow = iframe.contentWindow as Window & typeof globalThis;
        ownerWindow.requestAnimationFrame = vi.fn(() => 1);
        const plugin = createPlugin({files: ["Diagrams/Target.md"], settings: {debounce: 0}});

        const readingContainer = ownerDocument.createElement("div");
        readingContainer.innerHTML = '<a href="Target#Heading"><span>Target</span></a>';
        ownerDocument.body.appendChild(readingContainer);
        const processors = new DebouncedProcessors(plugin);
        processors.renderStates.set(readingContainer, {originalSource: "", source: "", ctx: {sourcePath: SOURCE_PATH}});
        processors.registerLinkHandlers(readingContainer);
        readingContainer.querySelector("span")?.dispatchEvent(new ownerWindow.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));
        expect(plugin.app.workspace.openLinkText).toHaveBeenCalledWith("Target#Heading", SOURCE_PATH, false);

        const lightboxContainer = ownerDocument.createElement("div");
        lightboxContainer.innerHTML = SVG;
        ownerDocument.body.appendChild(lightboxContainer);
        registerSvgLightbox(lightboxContainer, plugin, SOURCE_PATH);
        registerSvgLightbox(lightboxContainer, plugin, SOURCE_PATH);
        const svg = lightboxContainer.querySelector("svg") as SVGSVGElement;

        svg.querySelector("a text")?.dispatchEvent(new ownerWindow.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));
        expect(lightboxContainer.querySelector("[data-plantuml-lightbox-trigger]")).toBeNull();

        svg.querySelector("circle")?.dispatchEvent(new ownerWindow.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
        }));
        expect(lightboxContainer.querySelectorAll("[data-plantuml-lightbox-trigger]")).toHaveLength(1);
    });

    it("shrinks wide note SVGs without enlarging small ones and styles only the Lightbox clone for selection", () => {
        const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8").replace(/\s+/g, " ");
        const noteSvgRule = css.match(/\.puml-svg \{([^}]*)\}/)?.[1] ?? "";

        expect(noteSvgRule).toContain("max-width: 100%;");
        expect(noteSvgRule).toContain("height: auto !important;");
        expect(noteSvgRule).not.toMatch(/(?:^|;)\s*width:\s*100%;/);
        expect(css).toMatch(/\.plantuml-svg-lightbox-trigger \{[^}]*position: fixed;/);
        expect(css).toMatch(/\.plantuml-svg-lightbox-inline \{[^}]*position: absolute;/);
        expect(css).toMatch(/\.plantuml-svg-lightbox-native \{[^}]*opacity: 0;/);
        expect(css).toMatch(/\.plantuml-svg-lightbox-inline \{[^}]*pointer-events: none;/);
        expect(css).toMatch(/\.plantuml-svg-lightbox-inline :is\(text, tspan, textPath, a, a \*\) \{[^}]*pointer-events: auto;/);
        expect(css).toMatch(/\.plantuml-svg-lightbox-inline :is\(text, tspan, textPath\) \{[^}]*user-select: text;/);
        expect(css).not.toContain("is-plantuml-panning");
        expect(css).not.toMatch(/\.puml-svg \{[^}]*user-select: none;/);
    });
});
