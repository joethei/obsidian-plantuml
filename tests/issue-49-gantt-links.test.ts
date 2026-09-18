import {readFileSync} from "fs";
import {resolve} from "path";
import {describe, expect, it} from "vitest";
import {ResizeObserverStub} from "obsidian";
import {insertImageWithMap, insertSvgImage} from "../src/functions";

// a gantt diagram is much wider than a note, the links sit on the task bars far to the right
const MAP = '<map id="plantuml_map" name="plantuml_map">\n'
    + '<area shape="rect" id="id1" href="https://youtube.com" title="https://youtube.com" alt="" coords="1007,74,1339,87"/>\n'
    + '<area shape="rect" id="id2" href="https://google.com" title="https://google.com" alt="" coords="831,57,1339,70"/>\n'
    + '</map>';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
    + 'style="width:2578px;height:130px;background:#FFFFFF;" width="2578px" height="130px" viewBox="0 0 2578 130" preserveAspectRatio="none">'
    + '<a href="https://google.com" xlink:href="https://google.com"><rect x="831.538" y="57.805" width="508" height="12.805"/></a>'
    + '</svg>';

function setImageSize(img: HTMLImageElement, naturalWidth: number, width: number) {
    Object.defineProperty(img, "naturalWidth", {configurable: true, value: naturalWidth});
    Object.defineProperty(img, "width", {configurable: true, value: width});
}

function coords(el: HTMLElement) {
    return Array.from(el.querySelectorAll("area")).map(area => area.getAttribute("coords"));
}

describe("issue #49: links in wide diagrams", () => {
    it("scales the image map to the size the png is displayed at", () => {
        const el = document.createElement("div");
        insertImageWithMap(el, "https://example.com/png/ENCODED", MAP, "ENCODED");
        const img = el.querySelector("img");

        setImageSize(img, 2577, 581);
        img.dispatchEvent(new Event("load"));

        expect(coords(el)).toEqual(["227,17,302,20", "187,13,302,16"]);
    });

    it("rescales the image map from the original coordinates when the image is resized", () => {
        const el = document.createElement("div");
        insertImageWithMap(el, "https://example.com/png/ENCODED", MAP, "ENCODED");
        const img = el.querySelector("img");

        setImageSize(img, 2577, 581);
        img.dispatchEvent(new Event("load"));
        setImageSize(img, 2577, 1289);
        ResizeObserverStub.instances.forEach(observer => {
            if (observer.targets.includes(img)) observer.trigger();
        });

        expect(coords(el)).toEqual(["504,37,670,44", "416,29,670,35"]);
    });

    it("keeps the image map as is while the image is not loaded", () => {
        const el = document.createElement("div");
        insertImageWithMap(el, "https://example.com/png/ENCODED", MAP, "ENCODED");

        expect(coords(el)).toEqual(["1007,74,1339,87", "831,57,1339,70"]);
    });

    it("lets svg diagrams shrink to the width of the note", () => {
        const el = document.createElement("div");

        insertSvgImage(el, SVG);

        const svg = el.querySelector("svg");
        expect(svg.classList.contains("puml-svg")).toBe(true);
        expect(svg.querySelector("a")?.getAttribute("href")).toBe("https://google.com");

        const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8").replace(/\s+/g, " ");
        expect(css).toMatch(/\.puml-svg \{[^}]*max-width: 100%;/);
        expect(css).toMatch(/\.puml-svg \{[^}]*height: auto !important;/);
    });
});
