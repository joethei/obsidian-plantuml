import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {EventEmitter} from "events";
import * as nodeBuffer from "buffer";
import * as nodePath from "path";
import * as nodeOs from "os";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {LocalProcessors} from "../src/processors/localProcessors";
import type {Processor} from "../src/processors/processor";
import type {PlantUMLSettings} from "../src/settings";
import {createPlugin, setTheme} from "./helpers";

const MINDMAP = "@startmindmap\n* root node\n\t* some first level node\n\t\t* second level node\n\t* another first level node\n@endmindmap";
const COMPONENT = "[SpaceShip] .> [Input]";

/** renders the source through the DebouncedProcessors and returns what was handed to the renderer */
async function renderedSource(source: string, settings: Partial<PlantUMLSettings> = {}) {
    const plugin = createPlugin({settings});
    const renderer: Processor = {
        png: vi.fn(async () => undefined),
        svg: vi.fn(async () => undefined),
        ascii: vi.fn(async () => undefined),
    };
    plugin.serverProcessor = renderer;
    const el = document.createElement("div");

    await new DebouncedProcessors(plugin).png(source, el, {sourcePath: "Note.md"});

    expect(renderer.png).toHaveBeenCalledTimes(1);
    return vi.mocked(renderer.png).mock.calls[0][0];
}

describe("issue #50 / #46: headers and the start of the diagram", () => {
    it("passes the diagram on unchanged when no header is configured", async () => {
        expect(await renderedSource(MINDMAP)).toBe(MINDMAP);
        expect(await renderedSource(COMPONENT)).toBe(COMPONENT);
    });

    it("renders the same source with and without a blank line in front of @startmindmap", async () => {
        const withoutBlankLine = await renderedSource(MINDMAP);
        const withBlankLine = await renderedSource("\n" + MINDMAP);

        expect(withBlankLine.trim()).toBe(withoutBlankLine);
    });

    it("keeps the indentation of the mindmap", async () => {
        const source = await renderedSource(MINDMAP, {header: "skinparam backgroundColor #FFEEEE"});

        expect(source).toContain("\n\t\t* second level node\n");
    });

    it("inserts the header after the @start line, where PlantUML applies it", async () => {
        const header = "skinparam backgroundColor #FFEEEE";

        expect(await renderedSource(MINDMAP, {header})).toBe(
            "@startmindmap\n" + header + "\n* root node\n\t* some first level node\n\t\t* second level node\n\t* another first level node\n@endmindmap");
        expect(await renderedSource("\n" + MINDMAP, {header})).toBe(
            "\n@startmindmap\n" + header + "\n* root node\n\t* some first level node\n\t\t* second level node\n\t* another first level node\n@endmindmap");
    });

    it("inserts the header after @start lines with a title and any diagram type", async () => {
        const header = "!theme plain";

        expect(await renderedSource("@startuml My Diagram\nA -> B\n@enduml", {header}))
            .toBe("@startuml My Diagram\n!theme plain\nA -> B\n@enduml");
        expect(await renderedSource("  @startwbs\n* root\n@endwbs", {header}))
            .toBe("  @startwbs\n!theme plain\n* root\n@endwbs");
        expect(await renderedSource("@startgantt\r\n[Task] lasts 5 days\r\n@endgantt", {header}))
            .toBe("@startgantt\n!theme plain\r\n[Task] lasts 5 days\r\n@endgantt");
    });

    it("puts the header on top of diagrams without a start tag", async () => {
        const header = "skinparam backgroundColor #FFEEEE";

        expect(await renderedSource(COMPONENT, {header})).toBe(header + "\n" + COMPONENT);
        expect(await renderedSource("\n" + COMPONENT, {header})).toBe(header + "\n\n" + COMPONENT);
    });

    it("combines the general and the theme header, skipping empty ones", async () => {
        const settings = {header: "skinparam shadowing false", lightHeader: "skinparam backgroundColor white", darkHeader: "skinparam backgroundColor black"};

        setTheme("dark");
        expect(await renderedSource(MINDMAP, settings)).toMatch(/^@startmindmap\nskinparam shadowing false\nskinparam backgroundColor black\n\* root node/);

        setTheme("light");
        expect(await renderedSource(MINDMAP, {...settings, header: ""})).toMatch(/^@startmindmap\nskinparam backgroundColor white\n\* root node/);
    });
});

interface JarResult {
    stdout: string;
    stderr?: string;
    code?: number;
}

/** what the fake jar answers to the next `-pipe` calls, the map (`-pipemap`) is always empty */
const jarResults: JarResult[] = [];

function fakeExecFile(_cmd: string, args: string[]) {
    const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: {
            on: vi.fn(),
            write: vi.fn(),
            end: () => setTimeout(() => {
                const result = args.includes("-pipemap") ? {stdout: ""} : jarResults.shift() ?? {stdout: ""};
                if (result.stdout) child.stdout.emit("data", result.stdout);
                if (result.stderr) child.stderr.emit("data", result.stderr);
                child.emit("close", result.code ?? 0);
            }),
        },
    });
    return child;
}

describe("issue #46: output of the local jar", () => {
    beforeAll(() => {
        const modules: Record<string, unknown> = {
            child_process: {execFile: fakeExecFile},
            buffer: nodeBuffer,
            path: nodePath,
            os: nodeOs,
            // the jar is checked for existence before java is started
            fs: {promises: {access: async () => undefined}},
        };
        (window as unknown as {require: (id: string) => unknown}).require = (id: string) => modules[id];
    });

    beforeEach(() => {
        jarResults.length = 0;
    });

    const GRAPHVIZ_FAILURE: JarResult = {
        stdout: "<svg><text>PlantUML (1.2022.14) cannot parse result from dot/GraphViz.</text></svg>",
        stderr: "Exception java.lang.NullPointerException\n\tat net.sourceforge.plantuml.svek.SvekLine.<init>(SvekLine.java:218)",
    };
    const RENDERED: JarResult = {stdout: "<svg><text>SpaceShip</text><text>Input</text></svg>"};

    it("does not cache a diagram PlantUML failed to render, so the next render can succeed", async () => {
        const plugin = createPlugin({settings: {localJar: "/opt/plantuml.jar"}});
        const processor = new LocalProcessors(plugin);
        jarResults.push(GRAPHVIZ_FAILURE, RENDERED);

        const first = document.createElement("div");
        await processor.svg(COMPONENT, first, {sourcePath: "Note.md"});
        expect(first.textContent).toContain("cannot parse result from dot/GraphViz");
        expect(plugin.cache.set).not.toHaveBeenCalled();

        const second = document.createElement("div");
        await processor.svg(COMPONENT, second, {sourcePath: "Note.md"});
        expect(second.textContent).toBe("SpaceShipInput");
        expect(plugin.cache.set).toHaveBeenCalledTimes(1);
    });

    it("does not cache syntax errors", async () => {
        const plugin = createPlugin({settings: {localJar: "/opt/plantuml.jar"}});
        jarResults.push({stdout: "<svg><text>Syntax Error?</text></svg>", stderr: "ERROR\n1\nSyntax Error?", code: 200});

        const el = document.createElement("div");
        await new LocalProcessors(plugin).svg("@startuml\nfoo ->\n@enduml", el, {sourcePath: "Note.md"});

        expect(el.textContent).toBe("Syntax Error?");
        expect(plugin.cache.set).not.toHaveBeenCalled();
    });

    it("still caches diagrams that rendered fine", async () => {
        const plugin = createPlugin({settings: {localJar: "/opt/plantuml.jar"}});
        const processor = new LocalProcessors(plugin);
        jarResults.push(RENDERED);

        await processor.svg(COMPONENT, document.createElement("div"), {sourcePath: "Note.md"});
        const el = document.createElement("div");
        await processor.svg(COMPONENT, el, {sourcePath: "Note.md"});

        expect(el.textContent).toBe("SpaceShipInput");
        expect(plugin.cache.set).toHaveBeenCalledTimes(2);
        expect(jarResults).toHaveLength(0);
    });
});
