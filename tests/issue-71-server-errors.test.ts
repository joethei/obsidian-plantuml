import {beforeEach, describe, expect, it, vi} from "vitest";
import {request, requestUrl} from "obsidian";
import {ServerProcessor} from "../src/processors/serverProcessor";
import {DebouncedProcessors} from "../src/processors/debouncedProcessors";
import {createPlugin} from "./helpers";

const SOURCE = "@startuml\nA -left-> \n@enduml";
const ERROR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Syntax Error?</text></svg>';

type UrlResponse = Awaited<ReturnType<typeof requestUrl>>;

function respond(status: number, text: string) {
    vi.mocked(requestUrl).mockImplementation((async () => ({status, text, headers: {}, json: undefined, arrayBuffer: new ArrayBuffer(0)} as UrlResponse)) as unknown as typeof requestUrl);
}

function unreachable() {
    const error = new Error("net::ERR_CONNECTION_REFUSED");
    vi.mocked(request).mockRejectedValue(error);
    vi.mocked(requestUrl).mockImplementation((() => Promise.reject(error)) as unknown as typeof requestUrl);
}

function setup() {
    const plugin = createPlugin();
    plugin.serverProcessor = new ServerProcessor(plugin);
    const processors = new DebouncedProcessors(plugin);
    const el = document.createElement("div");
    document.body.appendChild(el);
    return {processors, el};
}

describe("issue #71: diagrams stay on 'Generating PlantUML diagram' with a server", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        // obsidian's request rejects on any status >= 400, dropping the body
        vi.mocked(request).mockRejectedValue(new Error("Request failed, status 400"));
    });

    it("shows the error diagram the server sends with a 400 for svg", async () => {
        respond(400, ERROR_SVG);
        const {processors, el} = setup();

        await processors.svg(SOURCE, el, {sourcePath: "Note.md"});

        await vi.waitFor(() => expect(el.querySelector("svg")).not.toBeNull());
        expect(el.textContent).toContain("Syntax Error?");
        expect(el.querySelector(".puml-loading")).toBeNull();
    });

    it("shows the error text the server sends with a 400 for ascii", async () => {
        respond(400, "A -left->\n Syntax Error?");
        const {processors, el} = setup();

        await processors.ascii(SOURCE, el, {sourcePath: "Note.md"});

        await vi.waitFor(() => expect(el.querySelector("code")?.textContent).toContain("Syntax Error?"));
        expect(el.querySelector(".puml-loading")).toBeNull();
    });

    it("shows an error for svg if the response is not a diagram", async () => {
        respond(502, "Bad Gateway");
        const {processors, el} = setup();

        await processors.svg(SOURCE, el, {sourcePath: "Note.md"});

        await vi.waitFor(() => expect(el.querySelector(".mod-error")).not.toBeNull());
        expect(el.querySelector(".puml-loading")).toBeNull();
    });

    it.each(["png", "svg", "ascii"] as const)("shows an error if the server can not be reached (%s)", async (type) => {
        unreachable();
        const {processors, el} = setup();

        await processors[type](SOURCE, el, {sourcePath: "Note.md"}).catch(() => undefined);

        await vi.waitFor(() => expect(el.querySelector(".mod-error")?.textContent).toBe("Could not reach the PlantUML server"));
        expect(el.querySelector(".puml-loading")).toBeNull();
    });
});
