/**
 * Recreates the DOM and String helpers Obsidian adds to the global prototypes,
 * so plugin code can run under jsdom.
 */
import {afterEach, vi} from "vitest";
import {Menu, Notice} from "obsidian";

interface DomElementInfo {
    cls?: string | string[];
    text?: string;
    attr?: Record<string, string | number | boolean | null>;
    title?: string;
    parent?: Node;
    href?: string;
}

function applyInfo(el: HTMLElement, info?: DomElementInfo | string) {
    if (!info) return;
    if (typeof info === "string") {
        el.className = info;
        return;
    }
    if (info.cls) {
        const classes = Array.isArray(info.cls) ? info.cls : info.cls.split(" ");
        el.classList.add(...classes.filter(Boolean));
    }
    if (info.text !== undefined) el.textContent = info.text;
    if (info.title !== undefined) el.title = info.title;
    if (info.href !== undefined) el.setAttribute("href", info.href);
    if (info.attr) {
        for (const [key, value] of Object.entries(info.attr)) {
            if (value === null || value === false) continue;
            el.setAttribute(key, String(value));
        }
    }
    if (info.parent) info.parent.appendChild(el);
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, info?: DomElementInfo | string, callback?: (el: HTMLElementTagNameMap[K]) => void) {
    const el = document.createElement(tag);
    applyInfo(el, info);
    callback?.(el);
    return el;
}

const nodeProto = Node.prototype as unknown as Record<string, unknown>;
const elementProto = Element.prototype as unknown as Record<string, unknown>;

nodeProto.createEl = function (this: Node, tag: keyof HTMLElementTagNameMap, info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
    const el = createElement(tag, info, callback);
    this.appendChild(el);
    return el;
};
nodeProto.createDiv = function (this: Node, info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
    return (this as unknown as {createEl: typeof nodeProto.createEl}).createEl("div", info, callback);
};
nodeProto.createSpan = function (this: Node, info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
    return (this as unknown as {createEl: typeof nodeProto.createEl}).createEl("span", info, callback);
};
nodeProto.empty = function (this: Node) {
    while (this.firstChild) this.removeChild(this.firstChild);
};
nodeProto.detach = function (this: Node) {
    this.parentNode?.removeChild(this);
};
nodeProto.instanceOf = function (this: Node, type: new () => unknown) {
    return this instanceof type;
};

elementProto.addClass = function (this: Element, ...classes: string[]) {
    this.classList.add(...classes);
};
elementProto.addClasses = function (this: Element, classes: string[]) {
    this.classList.add(...classes);
};
elementProto.removeClass = function (this: Element, ...classes: string[]) {
    this.classList.remove(...classes);
};
elementProto.hasClass = function (this: Element, cls: string) {
    return this.classList.contains(cls);
};
elementProto.toggleClass = function (this: Element, cls: string, value: boolean) {
    this.classList.toggle(cls, value);
};
elementProto.setAttr = function (this: Element, name: string, value: string | number | boolean | null) {
    if (value === null) {
        this.removeAttribute(name);
        return;
    }
    this.setAttribute(name, String(value));
};
elementProto.getText = function (this: Element) {
    return this.textContent ?? "";
};
elementProto.setText = function (this: Element, text: string) {
    this.textContent = text;
};
elementProto.onClickEvent = function (this: Element, listener: (evt: MouseEvent) => unknown, options?: AddEventListenerOptions) {
    this.addEventListener("click", listener as EventListener, options);
    this.addEventListener("auxclick", listener as EventListener, options);
};

const stringProto = String.prototype as unknown as Record<string, unknown>;
stringProto.contains = function (this: string, target: string) {
    return this.includes(target);
};

const globals = globalThis as unknown as Record<string, unknown>;
globals.activeDocument = document;
globals.activeWindow = window;
globals.createEl = createElement;
globals.createDiv = (info?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void) => createElement("div", info, callback);
globals.createSpan = (info?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void) => createElement("span", info, callback);

afterEach(() => {
    Notice.messages = [];
    Menu.lastShown = null;
    document.body.className = "";
    document.body.empty();
    vi.clearAllMocks();
});
