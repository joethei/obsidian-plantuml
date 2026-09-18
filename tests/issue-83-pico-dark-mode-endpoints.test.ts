import {describe, expect, it, vi} from "vitest";
import {request} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {ServerProcessor} from "../src/processors/serverProcessor";
import {DEFAULT_SETTINGS} from "../src/settings";
import {createPlugin, setTheme} from "./helpers";

// PicoWeb (java -jar plantuml.jar -picoweb) only serves /png/, /svg/ and /txt/.
// Anything else gets a 302 to a placeholder "PlantUML PicoWebServer" diagram, not an error.
const SERVER = "http://localhost:8089/plantuml";
const SOURCE = "@startuml\nfoo -> bar: hello\n@enduml";
const ENCODED = plantuml.encode(SOURCE);

function processor(darkModeEndpoints: boolean) {
    return new ServerProcessor(createPlugin({settings: {server_url: SERVER, darkModeEndpoints}}));
}

describe("issue #83: servers without dark mode endpoints", () => {
    it("keeps using the dark mode endpoints by default", async () => {
        expect(DEFAULT_SETTINGS.darkModeEndpoints).toBe(true);
        setTheme("dark");
        vi.mocked(request).mockResolvedValue("");
        const el = document.createElement("div");

        await processor(true).png(SOURCE, el, {sourcePath: "Note.md"});

        expect(el.querySelector("img")?.getAttribute("src")).toBe(SERVER + "/dpng/" + ENCODED);
    });

    it("requests /png/ in dark mode when dark mode endpoints are turned off", async () => {
        setTheme("dark");
        vi.mocked(request).mockResolvedValue("");
        const el = document.createElement("div");

        await processor(false).png(SOURCE, el, {sourcePath: "Note.md"});

        expect(el.querySelector("img")?.getAttribute("src")).toBe(SERVER + "/png/" + ENCODED);
    });

    it("requests /svg/ in dark mode when dark mode endpoints are turned off", async () => {
        setTheme("dark");
        vi.mocked(request).mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
        const el = document.createElement("div");

        await processor(false).svg(SOURCE, el, {sourcePath: "Note.md"});
        await vi.waitFor(() => expect(el.querySelector("svg")).not.toBeNull());

        expect(request).toHaveBeenCalledWith({url: SERVER + "/svg/" + ENCODED, method: "GET"});
    });

    it.each([true, false])("always requests /txt/ for ascii in dark mode (darkModeEndpoints: %s)", async (darkModeEndpoints) => {
        setTheme("dark");
        vi.mocked(request).mockResolvedValue("foo -> bar");
        const el = document.createElement("div");

        await processor(darkModeEndpoints).ascii(SOURCE, el, {sourcePath: "Note.md"});

        expect(request).toHaveBeenCalledWith({url: SERVER + "/txt/" + ENCODED});
        expect(el.querySelector(".mod-error")).toBeNull();
    });
});
