/**
 * #86: local rendering failures must end up as a visible error in the diagram
 * instead of leaving "Generating PlantUML diagram" forever.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {EventEmitter} from "events";
import * as nodePath from "path";
import {Buffer as NodeBuffer} from "buffer";
import {createPlugin, FakePlugin} from "./helpers";
import type {PlantUMLSettings} from "../src/settings";

const SOURCE = "@startuml\nA -> B\n@enduml";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>';

class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    stdin = Object.assign(new EventEmitter(), {
        write: vi.fn(() => true),
        end: vi.fn(),
    });
    kill = vi.fn(() => true);
}

/** what the fake PlantUML process does once it was started */
type Behaviour = (child: FakeChild) => void;

const exitWith = (code: number | null, stdout = "", stderr = "", signal: string | null = null): Behaviour => (child) => {
    if (stdout) child.stdout.emit("data", stdout);
    if (stderr) child.stderr.emit("data", stderr);
    child.emit("exit", code, signal);
    child.emit("close", code, signal);
};

let behaviour: Behaviour;
let jarExists: boolean;
let lastChild: FakeChild | null = null;
const execFile = vi.fn((_cmd: string, _args: string[], _options: unknown) => {
    const child = new FakeChild();
    lastChild = child;
    setTimeout(() => behaviour(child), 0);
    return child;
});
const access = vi.fn(async (path: string) => {
    if (!jarExists) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, access '${path}'`), {code: "ENOENT"});
    }
});

/** puts Electron's node `require` on window, with `path` behaving like on the given platform */
function installNodeRequire(platform: "posix" | "win32", homedir: string) {
    (window as unknown as {require: (id: string) => unknown}).require = (id: string) => {
        switch (id) {
            case "child_process": return {execFile};
            case "buffer": return {Buffer: NodeBuffer};
            case "path": return nodePath[platform];
            case "os": return {userInfo: () => ({homedir})};
            case "fs": return {promises: {access}};
        }
        throw new Error("unexpected module " + id);
    };
}

async function setup(settings: Partial<PlantUMLSettings> = {}, options: {platform?: "posix" | "win32", basePath?: string, homedir?: string} = {}) {
    // localProcessors caches the node modules, so load a fresh copy for each test
    vi.resetModules();
    installNodeRequire(options.platform ?? "posix", options.homedir ?? "/home/me");
    const {LocalProcessors} = await import("../src/processors/localProcessors");
    const {ServerProcessor} = await import("../src/processors/serverProcessor");
    const {DebouncedProcessors} = await import("../src/processors/debouncedProcessors");
    const {requestUrl} = await import("obsidian");

    const plugin: FakePlugin = createPlugin({
        settings: {localJar: "/opt/plantuml.jar", javaPath: "java", dotPath: "", debounce: 0, ...settings},
        files: ["Notes/Diagram.md"],
        basePath: options.basePath ?? "/vault",
    });
    plugin.localProcessor = new LocalProcessors(plugin);
    plugin.serverProcessor = new ServerProcessor(plugin);
    const local = plugin.localProcessor as InstanceType<typeof LocalProcessors>;
    return {plugin, local, requestUrl, debounced: new DebouncedProcessors(plugin)};
}

function errorText(el: HTMLElement) {
    return el.querySelector(".puml-error")?.textContent ?? null;
}

const ctx = {sourcePath: "Notes/Diagram.md"};

describe("issue #86: local rendering failures are shown in the diagram", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        behaviour = exitWith(0, SVG);
        jarExists = true;
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("reports a jar that does not exist instead of waiting forever", async () => {
        jarExists = false;
        behaviour = exitWith(1, "", "Error: Unable to access jarfile /opt/missing.jar\n");
        const {debounced} = await setup({localJar: "/opt/missing.jar"});
        const el = document.createElement("div");

        void debounced.svg(SOURCE, el, ctx);

        await vi.waitFor(() => expect(errorText(el)).not.toBeNull());
        expect(errorText(el)).toContain("/opt/missing.jar");
        expect(errorText(el)).toContain("Local JAR");
        expect(el.querySelector(".puml-loading")).toBeNull();
        expect(el.querySelector(".mod-error")).not.toBeNull();
        expect(consoleError).toHaveBeenCalled();
    });

    it("settles and shows stderr when java exits with an error and prints nothing on stdout", async () => {
        behaviour = exitWith(1, "", "Error: Unable to access jarfile /opt/plantuml.jar\n");
        const {debounced} = await setup();
        const el = document.createElement("div");

        void debounced.png(SOURCE, el, ctx);

        await vi.waitFor(() => expect(errorText(el)).not.toBeNull());
        expect(errorText(el)).toContain("exited with code 1");
        expect(errorText(el)).toContain("Unable to access jarfile");
    });

    it("rejects generateLocalImage when the process produced no output", async () => {
        behaviour = exitWith(1, "", "boom");
        const {local} = await setup();

        await expect(Promise.race([
            local.generateLocalImage(SOURCE, "svg" as never, "/vault"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("never settled")), 500)),
        ])).rejects.toThrow(/exited with code 1[\s\S]*boom/);
    });

    it("explains that java could not be found (ENOENT)", async () => {
        behaviour = (child) => {
            child.emit("error", Object.assign(new Error("spawn C:\\Java\\bin\\java.exe ENOENT"), {code: "ENOENT"}));
            child.emit("close", -4058, null);
        };
        const {debounced} = await setup({javaPath: "C:\\Java\\bin\\java.exe"});
        const el = document.createElement("div");

        void debounced.svg(SOURCE, el, ctx);

        await vi.waitFor(() => expect(errorText(el)).not.toBeNull());
        expect(errorText(el)).toContain("C:\\Java\\bin\\java.exe");
        expect(errorText(el)).toContain("Java path");
    });

    it("does not treat the output of a killed process as a diagram", async () => {
        behaviour = exitWith(null, "<svg xmlns=\"http://www.w3.org/2000/svg\"><te", "", "SIGTERM");
        const {debounced} = await setup();
        const el = document.createElement("div");

        void debounced.svg(SOURCE, el, ctx);

        await vi.waitFor(() => expect(errorText(el)).not.toBeNull());
        expect(errorText(el)).toContain("SIGTERM");
        expect(el.querySelector("svg")).toBeNull();
    });

    it("ignores stdin errors of a process that died early", async () => {
        behaviour = (child) => {
            child.stdin.emit("error", Object.assign(new Error("write EPIPE"), {code: "EPIPE"}));
            exitWith(1, "", "Error: Invalid or corrupt jarfile")(child);
        };
        const {debounced} = await setup();
        const el = document.createElement("div");

        void debounced.svg(SOURCE, el, ctx);

        await vi.waitFor(() => expect(errorText(el)).not.toBeNull());
        expect(errorText(el)).toContain("Invalid or corrupt jarfile");
    });

    it("stops a java process that never exits and says so", async () => {
        vi.useFakeTimers();
        try {
            behaviour = () => undefined;
            const {debounced} = await setup();
            const el = document.createElement("div");

            void debounced.svg(SOURCE, el, ctx);
            await vi.advanceTimersByTimeAsync(59 * 1000);
            expect(el.querySelector(".puml-loading")).not.toBeNull();

            await vi.advanceTimersByTimeAsync(2 * 1000);
            expect(errorText(el)).toContain("did not finish within 60 seconds");
            expect(lastChild?.kill).toHaveBeenCalledWith("SIGKILL");
        } finally {
            vi.useRealTimers();
        }
    });

    it("still shows the error diagram PlantUML renders itself (e.g. dot not found)", async () => {
        behaviour = exitWith(0, SVG, "java.io.IOException: Cannot run program \"dot\"");
        const {debounced} = await setup({dotPath: "dot"});
        const el = document.createElement("div");

        await debounced.svg(SOURCE, el, ctx);

        expect(el.querySelector("svg")).not.toBeNull();
        expect(errorText(el)).toBeNull();
    });

    it("shows errors of re-renders that go through the debouncer", async () => {
        const {debounced} = await setup();
        const el = document.createElement("div");
        await debounced.svg(SOURCE, el, ctx);
        expect(el.querySelector("svg")).not.toBeNull();

        behaviour = exitWith(1, "", "Error: Unable to access jarfile");
        void debounced.svg("@startuml\nA -> C\n@enduml", el, ctx);

        await vi.waitFor(() => expect(errorText(el)).toContain("Unable to access jarfile"));
    });

    it("replaces the loading text when the server can't be reached", async () => {
        const {debounced, requestUrl} = await setup({localJar: ""});
        vi.mocked(requestUrl).mockRejectedValueOnce(new Error("net::ERR_CONNECTION_REFUSED"));
        const el = document.createElement("div");

        await debounced.svg(SOURCE, el, ctx);

        expect(el.querySelector(".mod-error")?.textContent).toContain("Could not reach the PlantUML server");
        expect(el.querySelector(".puml-loading")).toBeNull();
    });

    it("shows that the server does not support ascii art", async () => {
        const {debounced, requestUrl} = await setup({localJar: ""});
        vi.mocked(requestUrl).mockResolvedValueOnce({status: 200, headers: {}, text: "�PNG\r\n...", json: undefined, arrayBuffer: new ArrayBuffer(0)});
        const el = document.createElement("div");

        await debounced.ascii(SOURCE, el, ctx);

        expect(el.querySelector(".mod-error")?.textContent).toContain("does not support ASCII Art");
        expect(el.querySelector(".puml-loading")).toBeNull();
    });
});

describe("issue #86: building the java command", () => {
    beforeEach(() => {
        behaviour = exitWith(0, SVG);
        jarExists = true;
    });

    async function commandFor(settings: Partial<PlantUMLSettings>, options: Parameters<typeof setup>[1] = {}) {
        const {local, plugin} = await setup(settings, options);
        await local.svg(SOURCE, document.createElement("div"), ctx);
        const [cmd, args, execOptions] = execFile.mock.calls[execFile.mock.calls.length - 1];
        return {cmd, args, cwd: plugin.replacer.getPath(ctx), options: execOptions as {cwd: string, shell?: unknown, maxBuffer?: number}};
    }

    it("passes Windows paths with spaces as single arguments without a shell", async () => {
        const {cmd, args, cwd, options} = await commandFor({
            localJar: "C:\\Program Files\\PlantUML\\plantuml.jar",
            javaPath: "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
        }, {platform: "win32", basePath: "C:\\Users\\me\\My Vault"});

        expect(cmd).toBe("C:\\Program Files\\Java\\jdk-21\\bin\\java.exe");
        expect(args).toEqual(["-Djava.awt.headless=true", "-Dapple.awt.UIElement=true", "-jar", "C:\\Program Files\\PlantUML\\plantuml.jar", "-charset", "utf-8", "-tsvg", "-pipe"]);
        expect(options.cwd).toBe(cwd);
        expect(options.shell).toBeUndefined();
    });

    it("strips the quotes Windows adds with 'Copy as path'", async () => {
        const {cmd, args} = await commandFor({
            localJar: "\"C:\\Program Files\\PlantUML\\plantuml.jar\"",
            javaPath: " \"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe\" ",
            dotPath: "\"C:\\Program Files\\Graphviz\\bin\\dot.exe\"",
        }, {platform: "win32", basePath: "C:\\Users\\me\\My Vault"});

        expect(cmd).toBe("C:\\Program Files\\Java\\jdk-21\\bin\\java.exe");
        expect(args).toContain("C:\\Program Files\\PlantUML\\plantuml.jar");
        expect(args.slice(args.indexOf("-graphvizdot"), args.indexOf("-graphvizdot") + 2))
            .toEqual(["-graphvizdot", "C:\\Program Files\\Graphviz\\bin\\dot.exe"]);
        expect(access).toHaveBeenCalledWith("C:\\Program Files\\PlantUML\\plantuml.jar");
    });

    it("resolves a relative jar against the vault on Windows and accepts an upper case .JAR", async () => {
        const {cmd, args} = await commandFor({localJar: "tools\\PlantUML.JAR", javaPath: "java"},
            {platform: "win32", basePath: "C:\\Users\\me\\My Vault"});

        expect(cmd).toBe("java");
        expect(args).toContain("-jar");
        expect(args).toContain("C:\\Users\\me\\My Vault\\tools\\PlantUML.JAR");
    });

    it("expands ~ and falls back to java when the java path is empty", async () => {
        const {cmd, args} = await commandFor({localJar: "~/tools/plantuml.jar", javaPath: ""}, {homedir: "/home/me"});

        expect(cmd).toBe("java");
        expect(args).toContain("/home/me/tools/plantuml.jar");
    });

    it("raises the output limit, so large diagrams are not cut off", async () => {
        const {options} = await commandFor({localJar: "/opt/plantuml.jar"});

        expect(options.maxBuffer).toBeGreaterThan(1024 * 1024);
    });
});
