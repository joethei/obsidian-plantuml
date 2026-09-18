import {describe, expect, it} from "vitest";
import {insertSvgImage} from "../src/functions";

const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';

/** an svg link like PlantUML renders it for `[[target label]]` */
function plantumlLink(url: string): string {
    const target = url.replace(/&/g, "&amp;");
    return `<a href="${target}" target="_top" title="${target}" xlink:actuate="onRequest" xlink:href="${target}" xlink:show="new" xlink:title="${target}" xlink:type="simple"><text>label</text></a>`;
}

function render(...links: string[]): SVGAElement[] {
    const el = createDiv();
    insertSvgImage(el, `<svg xmlns="http://www.w3.org/2000/svg" ${XLINK}>${links.join("")}</svg>`);
    return Array.from(el.querySelectorAll("a"));
}

describe("issue #39: external links in svg diagrams", () => {
    it.each([
        "https://example.com/stuff/morestuff#directtosomestuff",
        "http://example.com",
        "mailto:someone@example.com",
        "obsidian://open?vault=V&file=Note",
    ])("does not treat %s as an internal link", (url) => {
        const [link] = render(plantumlLink(url));

        expect(link.classList.contains("internal-link")).toBe(false);
        expect(link.classList.contains("external-link")).toBe(true);
        expect(link.getAttribute("href")).toBe(url);
        expect(link.getAttribute("target")).toBe("_blank");
    });

    it("recognizes external links that only have an xlink:href", () => {
        const [link] = render('<a xlink:href="https://example.com"><text>A</text></a>');

        expect(link.classList.contains("internal-link")).toBe(false);
        expect(link.classList.contains("external-link")).toBe(true);
    });

    it("keeps links to notes internal", () => {
        const [note, heading, external] = render(plantumlLink("Welcome"), plantumlLink("Welcome#Heading"), plantumlLink("https://example.com"));

        expect(note.classList.contains("internal-link")).toBe(true);
        expect(note.classList.contains("external-link")).toBe(false);
        expect(note.getAttribute("href")).toBe("Welcome");
        expect(heading.classList.contains("internal-link")).toBe(true);
        expect(external.classList.contains("internal-link")).toBe(false);
    });
});
