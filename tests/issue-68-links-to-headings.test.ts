import {describe, expect, it, vi} from "vitest";
import {createPlugin} from "./helpers";

/**
 * #68: [[[note#Heading with spaces]]] links failed with "Unable to find section #Heading in note",
 * the subpath was passed to getFirstLinkpathDest and plantuml split the link at the first space.
 */
function createVault(vaultName = "My Vault") {
    const plugin = createPlugin({files: ["Notes/Target Note.md", "Diagram.md"], vaultName});
    const getFirstLinkpathDest = vi.mocked(plugin.app.metadataCache.getFirstLinkpathDest);
    const resolve = getFirstLinkpathDest.getMockImplementation();
    // like Obsidian, only resolve link paths, not link texts containing a subpath
    getFirstLinkpathDest.mockImplementation((linkpath, sourcePath) => linkpath.contains("#") ? null : resolve(linkpath, sourcePath));
    return plugin;
}

describe("issue #68: links to headings and blocks", () => {
    describe("svg", () => {
        it("quotes targets containing spaces, so plantuml does not split them", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("A -> B : [[[Target Note]]]", "Diagram.md", "svg");

            expect(result).toBe('A -> B : [["Target Note"]]');
        });

        it("keeps headings with spaces", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[Target Note#Header with spaces]]]", "Diagram.md", "svg");

            expect(result).toBe('[["Target Note#Header with spaces"]]');
            expect(plugin.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Target Note", "Diagram.md");
        });

        it("keeps block references", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[Target Note#^block-id]]]", "Diagram.md", "svg");

            expect(result).toBe('[["Target Note#^block-id"]]');
        });

        it("uses the alias as label", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[Target Note#Header with spaces|the header]]]", "Diagram.md", "svg");

            expect(result).toBe('[["Target Note#Header with spaces" the header]]');
        });

        it("links to headings in the same note", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[#Some heading]]]", "Diagram.md", "svg");

            expect(result).toBe('[["Diagram#Some heading"]]');
        });

        it("keeps the heading for notes that don't exist yet", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[Missing Note#Heading]]]", "Diagram.md", "svg");

            expect(result).toBe('[["Missing Note#Heading"]]');
        });
    });

    describe("png", () => {
        it("appends the heading to the obsidian:// url", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[Target Note#Header with spaces]]]", "Diagram.md", "png");

            expect(result).toBe("[[obsidian://open?vault=My%20Vault&file=Notes%2FTarget%20Note.md%23Header%20with%20spaces Target Note#Header with spaces]]");
        });

        it("appends block references to the obsidian:// url and keeps the alias", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[Target Note#^block-id|the block]]]", "Diagram.md", "png");

            expect(result).toBe("[[obsidian://open?vault=My%20Vault&file=Notes%2FTarget%20Note.md%23%5Eblock-id the block]]");
        });

        it("links to headings in the same note", () => {
            const plugin = createVault();

            const result = plugin.replacer.replaceLinks("[[[#Some heading]]]", "Diagram.md", "png");

            expect(result).toBe("[[obsidian://open?vault=My%20Vault&file=Diagram.md%23Some%20heading Diagram#Some heading]]");
        });

        it("creates the note without the heading, if it doesn't exist yet", () => {
            const plugin = createVault("V");

            const result = plugin.replacer.replaceLinks("[[[Missing Note#Heading]]]", "Diagram.md", "png");

            expect(result).toBe("[[obsidian://new?vault=V&file=Missing%20Note Missing Note#Heading]]");
        });
    });
});
