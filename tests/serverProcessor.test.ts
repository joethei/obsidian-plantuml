import {describe, expect, it, vi} from "vitest";
import {request} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {ServerProcessor} from "../src/processors/serverProcessor";
import {createPlugin, setTheme} from "./helpers";

const SOURCE = "@startuml\nA -> B\n@enduml";

describe("ServerProcessor", () => {
    it("requests the svg from the configured server", async () => {
        const plugin = createPlugin({settings: {server_url: "http://localhost:8080"}});
        vi.mocked(request).mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
        const el = document.createElement("div");

        await new ServerProcessor(plugin).svg(SOURCE, el, {sourcePath: "Note.md"});
        await vi.waitFor(() => expect(el.querySelector("svg")).not.toBeNull());

        expect(request).toHaveBeenCalledWith({
            url: "http://localhost:8080/svg/" + plantuml.encode(SOURCE),
            method: "GET",
        });
    });

    it("uses the png endpoint plus the image map", async () => {
        const plugin = createPlugin({settings: {server_url: "http://localhost:8080"}});
        vi.mocked(request).mockResolvedValue("");
        setTheme("light");
        const el = document.createElement("div");

        await new ServerProcessor(plugin).png(SOURCE, el, {sourcePath: "Note.md"});

        const encoded = plantuml.encode(SOURCE);
        expect(el.querySelector("img")?.getAttribute("src")).toBe("http://localhost:8080/png/" + encoded);
        expect(request).toHaveBeenCalledWith({url: "http://localhost:8080/map/" + encoded, method: "GET"});
    });
});
