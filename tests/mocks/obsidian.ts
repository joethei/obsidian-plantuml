/**
 * Minimal runtime stand-in for the `obsidian` module, which only ships type definitions.
 * vitest.config.ts aliases `obsidian` to this file.
 * Extend it when code under test needs more of the API.
 */
import {vi} from "vitest";

export const Platform = {
    isDesktop: true,
    isDesktopApp: true,
    isMobile: false,
    isMobileApp: false,
    isMacOS: false,
    isWin: false,
    isLinux: true,
};

export const request = vi.fn(async (_request: unknown): Promise<string> => "");
export const requestUrl = vi.fn(async (_request: unknown) => ({
    status: 200,
    headers: {} as Record<string, string>,
    text: "",
    json: undefined as unknown,
    arrayBuffer: new ArrayBuffer(0),
}));

export const addIcon = vi.fn();
export const setIcon = vi.fn();

export interface Debouncer<T extends unknown[], V> {
    (...args: T): this;
    cancel(): this;
    run(): V | void;
}

export function debounce<T extends unknown[], V>(cb: (...args: T) => V, timeout = 0, resetTimer = false): Debouncer<T, V> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: T | null = null;
    const run = () => {
        timer = null;
        if (lastArgs === null) return;
        const args = lastArgs;
        lastArgs = null;
        return cb(...args);
    };
    const debounced = function (...args: T) {
        lastArgs = args;
        if (timer !== null && resetTimer) {
            clearTimeout(timer);
            timer = null;
        }
        if (timer === null) {
            timer = setTimeout(run, timeout);
        }
        return debounced;
    } as Debouncer<T, V>;
    debounced.cancel = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        lastArgs = null;
        return debounced;
    };
    debounced.run = run;
    return debounced;
}

export class Notice {
    static messages: string[] = [];
    message: string;

    constructor(message: string) {
        this.message = message;
        Notice.messages.push(message);
    }

    hide() {}
}

export class MenuItem {
    title = "";
    icon = "";
    callback: (evt?: unknown) => unknown = () => undefined;

    setTitle(title: string) { this.title = title; return this; }
    setIcon(icon: string) { this.icon = icon; return this; }
    onClick(callback: (evt?: unknown) => unknown) { this.callback = callback; return this; }
}

export class Menu {
    /** the most recently shown menu, handy for asserting on context menus */
    static lastShown: Menu | null = null;
    items: MenuItem[] = [];

    addItem(cb: (item: MenuItem) => unknown) {
        const item = new MenuItem();
        cb(item);
        this.items.push(item);
        return this;
    }

    addSeparator() { return this; }

    showAtMouseEvent(_evt: MouseEvent) {
        Menu.lastShown = this;
        return this;
    }

    showAtPosition(_pos: unknown) {
        Menu.lastShown = this;
        return this;
    }

    /** test helper: find an item by its title */
    getItem(title: string): MenuItem | undefined {
        return this.items.find(item => item.title === title);
    }
}

export class Events {
    on() { return {}; }
    off() {}
    offref() {}
    trigger() {}
}

export class Component {
    load() {}
    onload() {}
    unload() {}
    onunload() {}
    addChild<T>(child: T) { return child; }
    removeChild<T>(child: T) { return child; }
    register(_cb: () => unknown) {}
    registerEvent(_ref: unknown) {}
    registerDomEvent() {}
    registerInterval(id: number) { return id; }
}

export class TAbstractFile {
    path = "";
    name = "";
    parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
    basename = "";
    extension = "";
    stat = {ctime: 0, mtime: 0, size: 0};

    constructor(path = "") {
        super();
        this.path = path;
        this.name = path.split("/").pop() ?? path;
        const dot = this.name.lastIndexOf(".");
        this.basename = dot > 0 ? this.name.substring(0, dot) : this.name;
        this.extension = dot > 0 ? this.name.substring(dot + 1) : "";
    }
}

export class TFolder extends TAbstractFile {
    children: TAbstractFile[] = [];

    constructor(path = "") {
        super();
        this.path = path;
        this.name = path.split("/").pop() ?? path;
    }

    isRoot() { return this.path === "" || this.path === "/"; }
}

export class FileSystemAdapter {
    basePath: string;

    constructor(basePath = "/vault") {
        this.basePath = basePath;
    }

    getBasePath() { return this.basePath; }

    getFullPath(path: string) {
        return path.length === 0 ? this.basePath : `${this.basePath}/${path}`;
    }

    exists = vi.fn(async (_path: string) => true);
}

export class Plugin extends Component {
    app: unknown;
    manifest: unknown;

    constructor(app?: unknown, manifest?: unknown) {
        super();
        this.app = app;
        this.manifest = manifest;
    }

    loadData = vi.fn(async () => ({}));
    saveData = vi.fn(async (_data: unknown) => undefined);
    addSettingTab() {}
    addCommand() {}
    addRibbonIcon() {}
    registerView() {}
    registerExtensions() {}
    registerMarkdownCodeBlockProcessor() {}
    registerMarkdownPostProcessor() {}
}

export class PluginSettingTab {
    app: unknown;
    plugin: unknown;
    containerEl: HTMLElement;

    constructor(app: unknown, plugin: unknown) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = document.createElement("div");
    }

    display() {}
    hide() {}
}

export class ItemView extends Component {
    leaf: unknown;
    containerEl: HTMLElement = document.createElement("div");
    contentEl: HTMLElement = document.createElement("div");

    constructor(leaf: unknown) {
        super();
        this.leaf = leaf;
    }
}

export class TextFileView extends ItemView {
    data = "";
    file: TFile | null = null;

    requestSave() {}
}

export class MarkdownView extends TextFileView {}

export class WorkspaceLeaf {}

export const Keymap = {
    isModEvent: vi.fn(() => false),
    isModifier: vi.fn(() => false),
};

export function parseLinktext(linktext: string): {path: string, subpath: string} {
    const index = linktext.indexOf("#");
    if (index === -1) return {path: linktext, subpath: ""};
    return {path: linktext.substring(0, index), subpath: linktext.substring(index)};
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

/** jsdom has no ResizeObserver, Obsidian (Electron) does; tests can trigger observers via `ResizeObserver.instances` */
class ResizeObserverStub {
    static instances: ResizeObserverStub[] = [];
    targets: Element[] = [];

    constructor(public callback: () => void) {
        ResizeObserverStub.instances.push(this);
    }

    observe(target: Element) {
        this.targets.push(target);
    }

    unobserve(target: Element) {
        this.targets = this.targets.filter(t => t !== target);
    }

    disconnect() {
        this.targets = [];
    }

    /** simulate a resize of the observed elements */
    trigger() {
        this.callback();
    }
}

const globalScope = globalThis as unknown as {ResizeObserver?: unknown};
if (!globalScope.ResizeObserver) {
    globalScope.ResizeObserver = ResizeObserverStub;
}
export {ResizeObserverStub};
