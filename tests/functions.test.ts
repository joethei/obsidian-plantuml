import {describe, expect, it} from "vitest";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../src/functions";
import {createPlugin} from "./helpers";

describe("Replacer.replaceLinks", () => {
    it("turns vault links into plain PlantUML links for svg", () => {
        const plugin = createPlugin({files: ["Notes/Target.md"]});

        const result = plugin.replacer.replaceLinks("A -> B [[[Target]]]", "Diagram.md", "svg");

        expect(result).toBe("A -> B [[Target]]");
    });

    it("turns vault links into obsidian:// urls for png, keeping the alias", () => {
        const plugin = createPlugin({files: ["Notes/Target.md"], vaultName: "My Vault"});

        const result = plugin.replacer.replaceLinks("[[[Target|the target]]]", "Diagram.md", "png");

        expect(result).toBe("[[obsidian://open?vault=My%20Vault&file=Notes%2FTarget.md the target]]");
    });

    it("links to obsidian://new for notes that don't exist yet", () => {
        const plugin = createPlugin({vaultName: "V"});

        const result = plugin.replacer.replaceLinks("[[[Missing]]]", "Diagram.md", "png");

        expect(result).toBe("[[obsidian://new?vault=V&file=Missing Missing]]");
    });
});

describe("insert helpers", () => {
    it("inserts ascii output as a code block", () => {
        const el = document.createElement("div");

        insertAsciiImage(el, "+--+\n|A |\n+--+");

        expect(el.querySelector("pre > code")?.textContent).toBe("+--+\n|A |\n+--+");
    });

    it("replaces previous content when inserting an svg", () => {
        const el = document.createElement("div");
        el.createEl("h6", {text: "Generating PlantUML diagram"});

        insertSvgImage(el, '<svg xmlns="http://www.w3.org/2000/svg"><a href="Target"><text>A</text></a></svg>');

        expect(el.querySelector("h6")).toBeNull();
        expect(el.querySelector("svg a")?.classList.contains("internal-link")).toBe(true);
    });

    it("renders base64 png data with an image map", () => {
        const el = document.createElement("div");

        insertImageWithMap(el, "iVBORw0KGgo=", '<map id="x"><area href="https://example.com"></map>', "ENCODED");

        const img = el.querySelector("img");
        expect(img?.src).toBe("data:image/png;base64,iVBORw0KGgo=");
        expect(img?.useMap).toBe("#ENCODED");
        expect(el.querySelector("map")?.getAttribute("name")).toBe("ENCODED");
    });
});
