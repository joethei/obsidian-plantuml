import {describe, expect, it, vi} from "vitest";
import {Menu, TFile} from "obsidian";
import PlantumlPlugin from "../src/main";
import {PumlView} from "../src/PumlView";
import {PumlEmbed} from "../src/embed";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {DEFAULT_SETTINGS, PlantUMLSettingsTab} from "../src/settings";
import {createPlugin} from "./helpers";

vi.mock("localforage", () => {
    const localforage = {
        clear: vi.fn(async () => undefined),
        config: vi.fn(),
        getItem: vi.fn(async () => null),
        iterate: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
        setItem: vi.fn(async () => undefined),
    };
    return {...localforage, default: localforage};
});

const SOURCE = "@startuml\nA -> B\n@enduml";
const CONTEXT = {sourcePath: "Diagrams/example.puml"};

describe("default processor settings", () => {
    it("loads old settings without overwriting the saved default processor", async () => {
        const fakePlugin = createPlugin();
        const plugin = new PlantumlPlugin(fakePlugin.app, {});
        vi.spyOn(plugin, "loadData").mockResolvedValue({defaultProcessor: "svg"});

        await plugin.loadSettings();

        expect(plugin.settings.defaultProcessor).toBe("svg");
        expect(plugin.settings.codeBlockProcessor).toBe(DEFAULT_SETTINGS.codeBlockProcessor);
        expect(plugin.settings.codeBlockProcessor).toBe("png");
    });

    it("keeps includes on defaultProcessor and defaults ordinary code blocks to PNG", () => {
        expect(DEFAULT_SETTINGS.defaultProcessor).toBe("png");
        expect(DEFAULT_SETTINGS.codeBlockProcessor).toBe("png");

        const plugin = createPlugin();
        const definitions = new PlantUMLSettingsTab(plugin).getSettingDefinitions();
        const includes = definitions.find(definition => definition.name === "Default processor for includes");
        const codeBlocks = definitions.find(definition => definition.name === "Default processor for code blocks");

        expect(includes?.control).toMatchObject({
            type: "dropdown",
            key: "defaultProcessor",
            defaultValue: "png",
            options: {png: "PNG", svg: "SVG"},
        });
        expect(codeBlocks?.control).toMatchObject({
            type: "dropdown",
            key: "codeBlockProcessor",
            defaultValue: "png",
            options: {png: "PNG", svg: "SVG"},
        });
    });

    it("routes includes and ordinary code blocks through their independent settings", async () => {
        const plugin = createPlugin({settings: {defaultProcessor: "svg", codeBlockProcessor: "png"}});
        const processors = new DebouncedProcessors(plugin);
        const png = vi.spyOn(processors, "png").mockResolvedValue();
        const svg = vi.spyOn(processors, "svg").mockResolvedValue();
        const includeEl = document.createElement("div");
        const codeBlockEl = document.createElement("div");

        await processors.default(SOURCE, includeEl, CONTEXT);
        await processors.codeBlock(SOURCE, codeBlockEl, CONTEXT);

        expect(svg).toHaveBeenCalledWith(SOURCE, includeEl, CONTEXT);
        expect(png).toHaveBeenCalledWith(SOURCE, codeBlockEl, CONTEXT);

        plugin.settings.defaultProcessor = "png";
        plugin.settings.codeBlockProcessor = "svg";
        await processors.default(SOURCE, includeEl, CONTEXT);
        await processors.codeBlock(SOURCE, codeBlockEl, CONTEXT);

        expect(png).toHaveBeenCalledWith(SOURCE, includeEl, CONTEXT);
        expect(svg).toHaveBeenCalledWith(SOURCE, codeBlockEl, CONTEXT);
    });

    it("uses the current default processor when rerendering the same element", async () => {
        vi.useFakeTimers();
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});

        try {
            const plugin = createPlugin({settings: {defaultProcessor: "png", debounce: 1}});
            const png = vi.fn(async (_source: string, el: HTMLElement) => {
                el.replaceChildren(document.createElement("img"));
            });
            const svg = vi.fn(async (_source: string, el: HTMLElement) => {
                el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text>SVG</text></svg>';
            });
            plugin.serverProcessor = {png, svg} as never;
            const processors = new DebouncedProcessors(plugin);
            const el = document.createElement("div");

            await processors.default(SOURCE, el, CONTEXT);
            plugin.settings.defaultProcessor = "svg";
            void processors.default(SOURCE, el, CONTEXT);
            await vi.advanceTimersByTimeAsync(1000);

            expect(png).toHaveBeenCalledTimes(1);
            expect(svg).toHaveBeenCalledTimes(1);
            expect(el.dataset.filetype).toBe("svg");
            expect(el.querySelector(":scope > svg")).not.toBeNull();
            expect(el.querySelector<SVGSVGElement>(":scope > svg")?.dataset.plantumlLightboxRegistered).toBe("true");

            el.dispatchEvent(new MouseEvent("contextmenu"));
            await (Menu.lastShown as Menu).getItem("Copy diagram").callback();
            expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<svg"));
        } finally {
            Reflect.deleteProperty(navigator, "clipboard");
            vi.useRealTimers();
        }
    });

    it("registers generic code blocks through codeBlock and leaves explicit processors fixed", async () => {
        const fakePlugin = createPlugin();
        const app = fakePlugin.app as typeof fakePlugin.app & {
            embedRegistry: {registerExtensions: ReturnType<typeof vi.fn>; unregisterExtensions: ReturnType<typeof vi.fn>};
        };
        app.embedRegistry = {registerExtensions: vi.fn(), unregisterExtensions: vi.fn()};
        app.vault.on = vi.fn(() => ({}));

        const plugin = new PlantumlPlugin(app, {});
        const register = vi.spyOn(plugin, "registerMarkdownCodeBlockProcessor");

        plugin.onload();
        await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(9));

        try {
            const registrations = new Map(register.mock.calls);
            expect(plugin.debouncedProcessor.codeBlock).toEqual(expect.any(Function));
            expect(registrations.get("plantuml")).toBe(plugin.debouncedProcessor.codeBlock);
            expect(registrations.get("puml")).toBe(plugin.debouncedProcessor.codeBlock);
            expect(registrations.get("plantuml-png")).toBe(plugin.debouncedProcessor.png);
            expect(registrations.get("puml-png")).toBe(plugin.debouncedProcessor.png);
            expect(registrations.get("plantuml-svg")).toBe(plugin.debouncedProcessor.svg);
            expect(registrations.get("puml-svg")).toBe(plugin.debouncedProcessor.svg);
            expect(registrations.get("plantuml-ascii")).toBe(plugin.debouncedProcessor.ascii);
            expect(registrations.get("puml-ascii")).toBe(plugin.debouncedProcessor.ascii);
            expect(registrations.get("plantuml-map")).toBe(plugin.debouncedProcessor.png);
        } finally {
            plugin.onunload();
        }
    });
});

describe("include rendering entry points", () => {
    it("renders the PlantUML file view through default with its current context", async () => {
        const defaultProcessor = vi.fn(async () => undefined);
        const png = vi.fn(async () => undefined);
        const view = Object.create(PumlView.prototype) as PumlView;
        Object.assign(view, {
            currentView: "preview",
            file: new TFile(CONTEXT.sourcePath),
            previewEl: document.createElement("div"),
            previewDiv: null,
            plugin: {debouncedProcessor: {default: defaultProcessor, png}},
            getViewData: () => SOURCE,
        });

        await view.renderPreview();

        expect(defaultProcessor).toHaveBeenCalledWith(SOURCE, view.previewDiv, CONTEXT);
        expect(png).not.toHaveBeenCalled();
    });

    it("renders embeds through default with their current context", async () => {
        const defaultProcessor = vi.fn(async () => undefined);
        const png = vi.fn(async () => undefined);
        const file = new TFile(CONTEXT.sourcePath);
        const containerEl = document.createElement("div");
        const plugin = createPlugin();
        plugin.app.vault.cachedRead = vi.fn(async () => SOURCE);
        plugin.debouncedProcessor = {default: defaultProcessor, png} as never;

        await new PumlEmbed(plugin, file, {app: plugin.app, containerEl}).loadFile();

        expect(defaultProcessor).toHaveBeenCalledWith(SOURCE, containerEl, CONTEXT);
        expect(png).not.toHaveBeenCalled();
    });

    it("renders hover previews through default with their current context", async () => {
        const file = new TFile(CONTEXT.sourcePath);
        const defaultProcessor = vi.fn(async () => undefined);
        const png = vi.fn(async () => undefined);
        const svg = vi.fn(async () => undefined);
        const plugin = Object.create(PlantumlPlugin.prototype) as PlantumlPlugin;
        const popover = document.createElement("div");
        popover.className = "popover hover-popover file-embed is-loaded";
        Object.assign(plugin, {
            settings: {...DEFAULT_SETTINGS, defaultProcessor: "svg"},
            hover: {linkText: CONTEXT.sourcePath, sourcePath: "Notes/source.md"},
            debouncedProcessor: {default: defaultProcessor, png, svg},
            app: {
                metadataCache: {getFirstLinkpathDest: vi.fn(() => file)},
                vault: {read: vi.fn(async () => SOURCE)},
                workspace: {getLeaf: vi.fn()},
            },
        });

        await (plugin as unknown as {_handleHoverMutation(mutations: MutationRecord[]): Promise<void>})
            ._handleHoverMutation([{addedNodes: [popover]} as unknown as MutationRecord]);

        const rendered = popover.firstElementChild?.firstElementChild as HTMLElement;
        expect(defaultProcessor).toHaveBeenCalledWith(SOURCE, rendered, CONTEXT);
        expect(png).not.toHaveBeenCalled();
        expect(svg).not.toHaveBeenCalled();
    });
});
