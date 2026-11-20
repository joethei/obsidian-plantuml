import {afterEach, describe, expect, it, vi} from "vitest";
import {StringStream} from "@codemirror/language";
import {CodeMirrorModes, plantumlMode, PlantUMLState, registerCodeBlockHighlighting} from "../src/syntaxHighlighting";
import {loadPlugin} from "./helpers";

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

/**
 * the highlighted tokens, fed line by line as CodeMirror feeds a stream parser, optionally behind a hidden prefix
 * like the `> ` of a callout. Text without a token is left out.
 */
function codeBlockTokens(mode: ReturnType<typeof plantumlMode>, lines: string[], prefix = ""): [string, string][] {
    const state = mode.startState(2) as PlantUMLState;
    const result: [string, string][] = [];
    for (const line of lines) {
        const stream = new StringStream(prefix + line, 4, 2, () => "");
        stream.pos = prefix.length;
        stream.hideFirstChars(prefix.length, () => {
            while (!stream.eol()) {
                stream.start = stream.pos;
                const token = mode.token(stream, state);
                if (stream.pos === stream.start) throw new Error(`no progress at ${stream.pos} in "${line}"`);
                if (token) result.push([stream.current(), token]);
            }
            return null;
        });
    }
    return result;
}

function tokens(source: string): [string, string][] {
    return codeBlockTokens(plantumlMode(), source.split("\n"));
}

function fakeCodeMirror(modes: Record<string, unknown> = {}): CodeMirrorModes {
    return {
        modes,
        defineMode: vi.fn((name: string, factory: () => unknown) => {
            modes[name] = factory;
        }),
    };
}

describe("issue #34: syntax highlighting", () => {
    it("highlights a sequence diagram", () => {
        expect(tokens([
            "@startuml",
            "' a comment",
            "participant \"Long Name\" as L #red",
            "Alice -> Bob : hello note over loop",
            "alt success",
            "  Bob --> Alice : ok",
            "else failure",
            "end",
            "@enduml",
        ].join("\n"))).toEqual([
            ["@startuml", "tag"],
            ["' a comment", "comment"],
            ["participant", "keyword"], ["\"Long Name\"", "string"], ["as", "keyword"], ["L", "def"], ["#red", "atom"],
            ["->", "operator"],
            ["alt", "keyword"],
            ["-->", "operator"],
            ["else", "keyword"],
            ["end", "keyword"],
            ["@enduml", "tag"],
        ]);
    });

    it("leaves the text of notes and multi-line labels alone", () => {
        expect(tokens([
            "note left of Alice #aqua",
            "  this is a loop note",
            "end note",
            "note right: if then end",
            "start",
            ":first line",
            "if this then that;",
            "if (ready?) then (yes)",
            "  #pink:colored;",
            "endif",
            "-> label;",
            "stop",
        ].join("\n"))).toEqual([
            ["note", "keyword"], ["left", "keyword"], ["of", "keyword"], ["#aqua", "atom"],
            ["end note", "keyword"],
            ["note", "keyword"], ["right", "keyword"],
            ["start", "keyword"],
            ["if", "keyword"], ["then", "keyword"],
            ["#pink", "atom"],
            ["endif", "keyword"],
            ["->", "operator"],
            ["stop", "keyword"],
        ]);
    });

    it("highlights declarations but not the members of a class", () => {
        expect(tokens([
            "abstract class Node<T> extends Base {",
            "  {static} -int count",
            "  #parent : Node",
            "  -- separator --",
            "}",
            "Node \"1\" *-- \"many\" Leaf : contains >",
            "node \"Server\" <<Device>>",
            "skinparam sequence {",
            "  ArrowColor DeepSkyBlue",
            "}",
        ].join("\n"))).toEqual([
            ["abstract", "keyword"], ["class", "keyword"], ["Node", "def"], ["extends", "keyword"],
            ["static", "keyword"],
            ["--", "operator"], ["--", "operator"],
            ["\"1\"", "string"], ["*--", "operator"], ["\"many\"", "string"],
            ["node", "keyword"], ["\"Server\"", "string"], ["<<Device>>", "attribute"],
            ["skinparam", "keyword"], ["sequence", "property"],
            ["ArrowColor", "property"],
        ]);
    });

    it("highlights arrows but not hyphenated words or dates", () => {
        expect(tokens([
            "A -[#red,dashed]-> B",
            "A <|-- B",
            "A }|..|| B",
            "A -up-> B",
            "Bob ->x Alice",
            "x-ray - y",
        ].join("\n")).map(([text]) => text)).toEqual(["-[#red,dashed]->", "<|--", "}|..||", "-up->", "->x", "-"]);
    });

    it("highlights the preprocessor", () => {
        expect(tokens([
            "!include <C4/C4_Container>",
            "!$name = \"x\"",
            "!if %strlen($name) > 0",
            "!endif",
        ].join("\n"))).toEqual([
            ["!include", "meta"], ["<C4/C4_Container>", "string"],
            ["!", "meta"], ["$name", "variable-2"], ["=", "operator"], ["\"x\"", "string"],
            ["!if", "meta"], ["%strlen", "builtin"], ["$name", "variable-2"], ["0", "number"],
            ["!endif", "meta"],
        ]);
    });

    it("follows the diagram type", () => {
        expect(tokens([
            "@startmindmap",
            "* root start",
            "**:multi",
            "line;",
            "@endmindmap",
            "@startgantt",
            "[Prototype design] lasts 15 days",
            "@endgantt",
            "@startjson",
            "{\"ok\": true}",
            "@endjson",
            "@startditaa",
            "+--+ |cBLU| note",
            "@endditaa",
        ].join("\n"))).toEqual([
            ["@startmindmap", "tag"], ["*", "keyword"], ["**", "keyword"], ["@endmindmap", "tag"],
            ["@startgantt", "tag"], ["lasts", "keyword"], ["15", "number"], ["days", "keyword"], ["@endgantt", "tag"],
            ["@startjson", "tag"], ["\"ok\"", "property"], ["true", "atom"], ["@endjson", "tag"],
            ["@startditaa", "tag"], ["@endditaa", "tag"],
        ]);
    });

    it("highlights block comments across lines", () => {
        expect(tokens("/' multi\nline '/ Alice -> Bob")).toEqual([
            ["/' multi", "comment"], ["line '/", "comment"], ["->", "operator"],
        ]);
    });

    it("opens free text blocks only for commands, so the rest of the diagram stays highlighted", () => {
        expect(tokens([
            "class Note",
            "User \"1\" --> \"*\" Note",
            "Page *-- Header",
            "note over A : single line",
            "end note",
            "note right of Foo::bar",
            "  if this then that end",
            "end note",
            "node n1 [",
            "  This note is a multi-line description",
            "]",
            "class Folder",
        ].join("\n"))).toEqual([
            ["class", "keyword"], ["Note", "def"],
            ["\"1\"", "string"], ["-->", "operator"], ["\"*\"", "string"],
            ["*--", "operator"],
            ["note", "keyword"], ["over", "keyword"],
            ["end", "keyword"], ["note", "keyword"],
            ["note", "keyword"], ["right", "keyword"], ["of", "keyword"],
            ["end note", "keyword"],
            ["node", "keyword"], ["n1", "def"],
            ["class", "keyword"], ["Folder", "def"],
        ]);
    });

    it("ends labels the way the diagram type does", () => {
        expect(tokens([
            ":Status: if retry then stop;",
            ":Note: the following",
            "note that this is text",
            "end;",
            "stop",
            "@startmindmap",
            "**:Example",
            "<code>",
            "if foo then end",
            "</code>",
            ";",
            "@endmindmap",
        ].join("\n"))).toEqual([
            ["stop", "keyword"],
            ["@startmindmap", "tag"], ["**", "keyword"], ["@endmindmap", "tag"],
        ]);
    });

    it("highlights style blocks, also on a single line and in data diagrams", () => {
        expect(tokens([
            "<style>root { FontSize 10 }</style>",
            "participant X",
            "@startjson",
            "!theme plain",
            "<style>",
            ".h { BackgroundColor red }",
            "</style>",
            "{\"msg\": \"say \\\"hi\\\"\"}",
            "@endjson",
            "@startdot",
            "digraph G { node [shape=box]; a -> b; }",
            "@enddot",
        ].join("\n"))).toEqual([
            ["<style>", "tag"], ["FontSize", "property"], ["10", "number"], ["</style>", "tag"],
            ["participant", "keyword"], ["X", "def"],
            ["@startjson", "tag"],
            ["!theme", "meta"], ["plain", "string"],
            ["<style>", "tag"], [".h", "tag"], ["BackgroundColor", "property"], ["</style>", "tag"],
            ["\"msg\"", "property"], ["\"say \\\"hi\\\"\"", "string"],
            ["@endjson", "tag"],
            ["@startdot", "tag"], ["@enddot", "tag"],
        ]);
    });

    it("tokenizes code blocks line by line, also behind a callout prefix", () => {
        const lines = ["participant Alice", "' comment", "- Alice -> Bob : x"];
        const expected = [["participant", "keyword"], ["Alice", "def"], ["' comment", "comment"], ["->", "operator"]];

        expect(codeBlockTokens(plantumlMode(), lines)).toEqual(expected);
        expect(codeBlockTokens(plantumlMode(), lines, "> ")).toEqual(expected);
    });
});

describe("issue #34: code block registration", () => {
    afterEach(() => {
        Reflect.deleteProperty(window, "CodeMirror");
    });

    it("registers a mode per code block language and removes it again", () => {
        const codeMirror = fakeCodeMirror();
        const unregister = registerCodeBlockHighlighting(codeMirror, ["plantuml", "puml-svg"]);

        expect(Object.keys(codeMirror.modes)).toEqual(["plantuml", "puml-svg"]);
        const mode = (codeMirror.modes.plantuml as () => ReturnType<typeof plantumlMode>)();
        expect(codeBlockTokens(mode, ["actor Bob"])).toEqual([["actor", "keyword"], ["Bob", "def"]]);

        unregister();
        expect(codeMirror.modes).toEqual({});
    });

    it("keeps modes other plugins registered", () => {
        const other = () => ({token: () => null});
        const codeMirror = fakeCodeMirror({puml: other});

        registerCodeBlockHighlighting(codeMirror, ["plantuml", "puml"])();

        expect(codeMirror.defineMode).toHaveBeenCalledTimes(1);
        expect(codeMirror.modes).toEqual({puml: other});
    });

    it("keeps modes other plugins registered after it", () => {
        const codeMirror = fakeCodeMirror();
        const unregister = registerCodeBlockHighlighting(codeMirror, ["plantuml"]);
        const other = () => ({token: () => null});
        codeMirror.modes.plantuml = other;

        unregister();

        expect(codeMirror.modes).toEqual({plantuml: other});
    });

    it("does nothing without the CodeMirror 5 mode registry", () => {
        expect(() => registerCodeBlockHighlighting(undefined, ["plantuml"])()).not.toThrow();
    });

    it("highlights every code block language the plugin renders", async () => {
        const codeMirror = fakeCodeMirror();
        Object.assign(window, {CodeMirror: codeMirror});
        const {plugin, register, registerProcessor} = await loadPlugin();

        try {
            const languages = registerProcessor.mock.calls.map(([language]) => language);
            expect(Object.keys(codeMirror.modes).sort()).toEqual([...languages].sort());

            // the modes go when the plugin is unloaded
            (register.mock.calls[0][0] as () => void)();
            expect(codeMirror.modes).toEqual({});
        } finally {
            plugin.onunload();
        }
    });
});
