import {describe, expect, it, vi} from "vitest";
import {TFile} from "obsidian";
import {PumlEmbed} from "../src/embed";
import {extractCaption} from "../src/functions";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {DEFAULT_SETTINGS, PlantUMLSettings, PlantUMLSettingsTab} from "../src/settings";
import {createPlugin} from "./helpers";

const SOURCE = "@startuml\ncaption Figure 1: Login\nA -> B\n@enduml";
const CONTEXT = {sourcePath: "Notes/example.md"};

function render(settings: Partial<PlantUMLSettings> = {}) {
    const plugin = createPlugin({settings: {debounce: 1, ...settings}});
    const svg = vi.fn(async (_source: string, el: HTMLElement) => {
        el.empty();
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text></svg>';
    });
    plugin.serverProcessor = {svg} as never;
    return {plugin, svg, processors: new DebouncedProcessors(plugin), el: document.createElement("div")};
}

function caption(el: HTMLElement) {
    return el.querySelector(":scope > .puml-caption")?.textContent ?? null;
}

describe("extractCaption", () => {
    it("removes the caption line and returns its text", () => {
        expect(extractCaption(SOURCE)).toEqual({source: "@startuml\n\nA -> B\n@enduml", caption: "Figure 1: Login"});
        expect(extractCaption("Caption: Overview \r\nA -> B").caption).toBe("Overview");
    });

    it("uses the last caption like PlantUML and turns \\n into line breaks", () => {
        const {source, caption} = extractCaption("caption first\nA -> B\n  caption second\\nline");
        expect(caption).toBe("second\nline");
        expect(source).not.toContain("caption");
    });

    it("only takes captions on the top level of the first page", () => {
        const notCaptions = [
            "<style>\ncaption {\n  FontSize 10\n}\n</style>",
            "class Photo {\n  caption : String\n}",
            "object img {\n caption = \"x\"\n}",
            "@startyaml\ncaption: Sunset\n@endyaml",
            "/'\ncaption old caption\n'/",
            "note left of A\nCaption of the table: foo\nend note",
            "legend\ncaption x\nendlegend",
            "title\ncaption x\nend title",
            "!if %false()\ncaption x\n!endif",
            "!procedure $p()\ncaption x\n!endprocedure",
            "A -> B\nnewpage\ncaption second page",
            "@startuml\nA -> B\n@enduml\n@startuml\ncaption second diagram\n@enduml",
            "captionist -> B",
        ];
        for (const source of notCaptions) {
            expect(extractCaption(source)).toEqual({source, caption: null});
        }
        expect(extractCaption("note left of A : text\ncaption {draft} Login").caption).toBe("{draft} Login");
        expect(extractCaption("class A {\n}\n/' x '/\ncaption after blocks").caption).toBe("after blocks");
    });

    it("leaves captions only PlantUML can render inside the image", () => {
        for (const text of ["**bold**", "<i>x</i>", "$name", "%date()", "see [[https://plantuml.com]]", "a\\\\nb"]) {
            const source = `caption plain\ncaption ${text}`;
            expect(extractCaption(source)).toEqual({source, caption: null});
        }
    });
});

describe("captions below diagrams", () => {
    it("keeps the caption inside the image unless enabled, also for embeds", async () => {
        const {processors, svg, el} = render();

        await processors.svg(SOURCE, el, {...CONTEXT, caption: "From the note"});

        expect(svg).toHaveBeenCalledWith(expect.stringContaining("caption Figure 1: Login"), el, expect.anything());
        expect(caption(el)).toBeNull();
        expect(el.hasAttribute("role")).toBe(false);
    });

    it("renders the caption below the diagram instead of inside the image", async () => {
        const {processors, svg, el} = render({captionBelowDiagram: true});

        await processors.svg(SOURCE, el, CONTEXT);

        expect(svg.mock.calls[0][0]).not.toContain("caption");
        expect(el.querySelector(":scope > svg")).not.toBeNull();
        const captionEl = el.lastElementChild as HTMLElement;
        expect(captionEl.className).toBe("puml-caption");
        expect(captionEl.textContent).toBe("Figure 1: Login");
        expect(el.hasClass("puml-figure")).toBe(true);
        expect(el.getAttribute("role")).toBe("figure");
        expect(el.getAttribute("aria-labelledby")).toBe(captionEl.id);
        // Obsidian shows aria-label as tooltip
        expect(el.hasAttribute("aria-label")).toBe(false);
    });

    it("replaces the caption of the diagram with the display text of an embed", async () => {
        const {processors, svg, el} = render({captionBelowDiagram: true});

        await processors.svg(SOURCE, el, {...CONTEXT, caption: "From the note"});

        expect(svg.mock.calls[0][0]).not.toContain("caption");
        expect(el.querySelectorAll(".puml-caption")).toHaveLength(1);
        expect(caption(el)).toBe("From the note");
    });

    it("updates the caption when the diagram is rerendered", async () => {
        vi.useFakeTimers();
        try {
            const {processors, el} = render({captionBelowDiagram: true});

            await processors.svg(SOURCE, el, CONTEXT);
            void processors.svg(SOURCE.replace("Login", "Logout"), el, CONTEXT);
            await vi.advanceTimersByTimeAsync(1000);
            expect(el.querySelectorAll(".puml-caption")).toHaveLength(1);
            expect(caption(el)).toBe("Figure 1: Logout");

            void processors.svg("@startuml\nA -> B\n@enduml", el, CONTEXT);
            await vi.advanceTimersByTimeAsync(1000);
            expect(caption(el)).toBeNull();
            expect(el.hasClass("puml-figure")).toBe(false);
            expect(el.hasAttribute("role")).toBe(false);
            expect(el.hasAttribute("aria-labelledby")).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows the caption of the diagram that finished last", async () => {
        vi.useFakeTimers();
        try {
            const {plugin, processors, el} = render({captionBelowDiagram: true});
            let finishFirst: () => void = () => undefined;
            const svg = vi.fn(async (source: string, el: HTMLElement) => {
                if (svg.mock.calls.length === 1) await new Promise<void>(resolve => {
                    finishFirst = resolve;
                });
                el.empty();
                el.createEl("p", {text: source.includes("A -> C") ? "second" : "first"});
            });
            plugin.serverProcessor = {svg} as never;

            const first = processors.svg(SOURCE, el, CONTEXT);
            void processors.svg(SOURCE.replace("Login", "Logout").replace("A -> B", "A -> C"), el, CONTEXT);
            await vi.advanceTimersByTimeAsync(1000);
            expect(el.querySelector("p")?.textContent).toBe("second");
            expect(caption(el)).toBe("Figure 1: Logout");

            finishFirst();
            await first;
            expect(el.querySelector("p")?.textContent).toBe("first");
            expect(caption(el)).toBe("Figure 1: Login");
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps the caption when the diagram could not be rendered", async () => {
        const {plugin, processors, el} = render({captionBelowDiagram: true});
        plugin.serverProcessor = {svg: vi.fn(async () => {
            throw new Error("boom");
        })} as never;
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            await processors.svg(SOURCE, el, CONTEXT);
        } finally {
            consoleError.mockRestore();
        }

        expect(el.querySelector(".puml-error")).not.toBeNull();
        expect(caption(el)).toBe("Figure 1: Login");
    });

    it("is a toggle that is off by default", () => {
        expect(DEFAULT_SETTINGS.captionBelowDiagram).toBe(false);
        const definitions = new PlantUMLSettingsTab(createPlugin()).getSettingDefinitions();
        const setting = definitions.find(definition => definition.name === "Captions below diagrams");
        expect(setting?.control).toMatchObject({type: "toggle", key: "captionBelowDiagram", defaultValue: false});
    });
});

describe("embed captions", () => {
    async function loadEmbed(attributes: Record<string, string>) {
        const file = new TFile("Diagrams/flow.puml");
        const containerEl = document.createElement("span");
        for (const [name, value] of Object.entries(attributes)) containerEl.setAttribute(name, value);
        const defaultProcessor = vi.fn(async () => undefined);
        const plugin = createPlugin();
        plugin.app.vault.cachedRead = vi.fn(async () => SOURCE);
        plugin.debouncedProcessor = {default: defaultProcessor} as never;

        await new PumlEmbed(plugin, file, {app: plugin.app, containerEl}).loadFile();
        return defaultProcessor.mock.calls[0][2] as {sourcePath: string, caption?: string};
    }

    it("passes the display text of the embed as caption", async () => {
        expect(await loadEmbed({src: "flow.puml", alt: " The login flow "}))
            .toEqual({sourcePath: "Diagrams/flow.puml", caption: "The login flow"});
        expect((await loadEmbed({src: "flow.puml", alt: "The login flow|400"})).caption).toBe("The login flow");
    });

    it("ignores embeds without display text and sizes", async () => {
        for (const alt of ["", "flow.puml", "flow", "Diagrams/flow.puml", "400", "400x300"]) {
            expect((await loadEmbed({src: "flow.puml", alt})).caption).toBeUndefined();
        }
        expect((await loadEmbed({src: "Diagrams/flow"})).caption).toBeUndefined();
    });
});
