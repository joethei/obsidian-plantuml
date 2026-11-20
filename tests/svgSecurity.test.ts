import {describe, expect, it, vi} from "vitest";
import {
    copySvgTextToClipboard,
    isRelativeVaultLink,
    isUnsafeSvgAttribute,
    isUnsafeSvgElement,
    routeSvgAnchorClick,
    sanitizeSvg,
    serializeSvgTextFragments,
    sliceSvgText,
} from "../src/svgSecurity";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

describe("SVG sanitizer", () => {
    it("rejects malformed roots, active content, event handlers, unsafe links, and unknown namespaces", () => {
        expect(sanitizeSvg("<div />", document)).toBeNull();

        const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}" xmlns:evil="https://unsafe.example/ns"
            onclick="alert(1)" xml:base="https://unsafe.example/">
            <script>alert(1)</script>
            <animate attributeName="href" to="https://unsafe.example/" />
            <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
            <evil:item evil:attribute="unsafe" />
            <rect onmouseover="alert(1)" fill="url(https://unsafe.example/fill.svg)" />
            <a href="java&#10;script:alert(1)" target="_top"><text>unsafe</text></a>
        </svg>`, document);

        expect(svg).not.toBeNull();
        expect(svg?.hasAttribute("onclick")).toBe(false);
        expect(svg?.hasAttributeNS(XML_NAMESPACE, "base")).toBe(false);
        expect(svg?.hasAttributeNS(XMLNS_NAMESPACE, "evil")).toBe(false);
        expect(svg?.querySelector("script, animate, foreignObject")).toBeNull();
        expect(svg?.querySelector("rect")?.attributes).toHaveLength(0);
        expect(svg?.querySelector("a")?.hasAttribute("href")).toBe(false);
        expect(svg?.querySelector("a")?.hasAttribute("target")).toBe(false);
    });

    it("uses explicit element and attribute allowlists while preserving representative PlantUML output", () => {
        const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}" xmlns:xlink="${XLINK_NAMESPACE}"
            width="442px" height="159px" viewBox="0 0 442 159" preserveAspectRatio="xMidYMid meet"
            contentStyleType="text/css" zoomAndPan="magnify">
            <title>Theme and sprite sample</title>
            <desc>Representative PlantUML SVG</desc>
            <style>.entity &gt; text { fill: #181818; font-family: sans-serif; font-size: 14px; }</style>
            <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ffffff" />
                    <stop offset="100%" stop-color="#181818" />
                </linearGradient>
                <clipPath id="clip"><rect width="20" height="20" /></clipPath>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
                    <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .2 0" result="shadow" />
                    <feOffset in="shadow" dx="2" dy="2" result="offset" />
                    <feBlend in="SourceGraphic" in2="offset" mode="normal" />
                </filter>
                <symbol id="sprite" viewBox="0 0 10 10"><path d="M0 0h10v10z" /></symbol>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L9,3 z" />
                </marker>
            </defs>
            <g class="entity" transform="translate(10 10)" filter="url(#shadow)" clip-path="url(#clip)">
                <rect width="100" height="40" rx="2.5" fill="url(#gradient)" stroke="#181818" />
                <use href="#sprite" x="4" y="4" width="10" height="10" />
                <image x="20" y="4" width="10" height="10" href="data:image/png;base64,AQIDBA==" />
                <text x="10" y="30" textLength="60" lengthAdjust="spacing"><tspan>Entity</tspan></text>
                <path d="M10 50L100 50" marker-end="url(#arrow)" />
            </g>
            <handler><text>handler</text></handler>
            <listener><text>listener</text></listener>
            <animation><text>animation</text></animation>
            <prefetch href="https://unsafe.example/resource" />
            <font-face-uri href="https://unsafe.example/font" />
            <color-profile href="https://unsafe.example/profile" />
            <future-resource href="https://unsafe.example/future" />
            <rect unknown-resource="https://unsafe.example/rect" externalResourcesRequired="true" />
        </svg>`, document);

        expect(svg).not.toBeNull();
        expect(svg?.querySelector("style, linearGradient, clipPath, filter, feGaussianBlur, feColorMatrix, feOffset, feBlend, symbol, marker, use, image, text, tspan")).not.toBeNull();
        expect(svg?.querySelector("use")?.getAttribute("href")).toBe(`#${svg?.querySelector("symbol")?.id}`);
        expect(svg?.querySelector("image")?.getAttribute("href")).toBe("data:image/png;base64,AQIDBA==");
        expect(svg?.querySelector("handler, listener, animation, prefetch, font-face-uri, color-profile, future-resource")).toBeNull();
        const finalRect = Array.from(svg?.querySelectorAll("rect") ?? []).at(-1);
        expect(finalRect?.hasAttribute("unknown-resource")).toBe(false);
        expect(finalRect?.hasAttribute("externalResourcesRequired")).toBe(false);
    });

    it("namespaces every local reference away from document and sanitizer-call ID collisions", () => {
        const ids = ["gradient", "filter", "mask", "clip", "marker", "sprite", "painted"];
        const unsafeOriginal = document.createElementNS(SVG_NAMESPACE, "svg");
        unsafeOriginal.innerHTML = ids.map(id => `<g id="${id}"></g>`).join("");
        document.body.appendChild(unsafeOriginal);
        const source = `<svg xmlns="${SVG_NAMESPACE}" xmlns:xlink="${XLINK_NAMESPACE}">
            <style>#painted { fill: url(#gradient); filter: url('#filter'); mask: url(#mask); clip-path: url(#clip); marker-end: url(#marker); }</style>
            <defs>
                <linearGradient id="gradient" />
                <filter id="filter" />
                <mask id="mask" />
                <clipPath id="clip" />
                <marker id="marker" />
                <symbol id="sprite" />
            </defs>
            <g id="painted" fill="url(#gradient)" filter="url(#filter)" mask="url(#mask)" clip-path="url(#clip)" marker-start="url(#marker)" marker-mid="url(#marker)" marker-end="url(#marker)" />
            <use href="#sprite" />
            <use xlink:href="#sprite" />
            <a href="https://example.com/#sprite"><text>external</text></a>
        </svg>`;

        const clones = [sanitizeSvg(source, document), sanitizeSvg(source, document)] as SVGSVGElement[];
        clones.forEach(clone => document.body.appendChild(clone));

        const cloneIdSets = clones.map(clone => new Set(Array.from(clone.querySelectorAll("[id]"), element => element.id)));
        expect(cloneIdSets[0].size).toBe(ids.length);
        expect(cloneIdSets[1].size).toBe(ids.length);
        expect([...cloneIdSets[0]].every(id => !ids.includes(id) && !cloneIdSets[1].has(id))).toBe(true);

        for (const [clone, cloneIds] of clones.map((clone, index) => [clone, cloneIdSets[index]] as const)) {
            const localTargets = [
                ...Array.from(clone.querySelectorAll("use"), use => use.getAttribute("href") ?? use.getAttributeNS(XLINK_NAMESPACE, "href") ?? ""),
                ...["fill", "filter", "mask", "clip-path", "marker-start", "marker-mid", "marker-end"]
                    .map(attribute => clone.querySelector("g[fill]")?.getAttribute(attribute)?.match(/#([^)'"]+)/)?.[1] ?? "")
                    .map(id => `#${id}`),
                ...Array.from(clone.querySelector("style")?.textContent?.matchAll(/url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)/g) ?? [], match => `#${match[1]}`),
            ];
            expect(localTargets).toHaveLength(14);
            for (const target of localTargets) {
                expect(target).toMatch(/^#[a-zA-Z][\w-]+$/);
                const id = target.slice(1);
                expect(cloneIds.has(id), target).toBe(true);
                expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
            }

            const paintedId = Array.from(cloneIds).find(id => id.endsWith("painted"));
            expect(clone.querySelector("style")?.textContent).toContain(`#${paintedId}`);
            expect(clone.querySelector("a")?.getAttribute("href")).toBe("https://example.com/#sprite");
        }
    });

    it("canonicalizes percent encoding before sanitizing and classifying links", () => {
        const unsafeTargets = [
            "%6a%61%76%61%73%63%72%69%70%74%3aalert(1)",
            "%66%69%6c%65%3a///etc/passwd",
            "%64%61%74%61%3atext/html,unsafe",
            "%6f%62%73%69%64%69%61%6e%3a//open?vault=Test%20Vault&amp;file=Target",
            "%2f%2funsafe.example/path",
            "%252f%252funsafe.example/path",
            "java%0ascript:alert(1)",
            "%E0%A4%A",
        ];
        const anchors = unsafeTargets.map((target, index) => `<a id="unsafe-${index}" href="${target}"><text>unsafe</text></a>`).join("");
        const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}">
            <a id="safe" href="Folder%2FNote%23Heading"><text>safe</text></a>
            ${anchors}
        </svg>`, document);
        const sanitizedAnchors = Array.from(svg?.querySelectorAll("a") ?? []);

        expect(sanitizedAnchors[0]?.getAttribute("href")).toBe("Folder/Note#Heading");
        expect(sanitizedAnchors[0]?.getAttribute("data-href")).toBe("Folder/Note#Heading");
        unsafeTargets.forEach((target, index) => {
            expect(sanitizedAnchors[index + 1]?.hasAttribute("href"), target).toBe(false);
            expect(isRelativeVaultLink(target), target).toBe(false);
        });
        expect(isRelativeVaultLink("Folder%2FNote%23Heading")).toBe(true);
    });

    it("preserves encoded external URL semantics after safety classification", () => {
        const target = "https://example.com/?x=%26y%23z";
        const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}">
            <a href="  ${target}  "><text>external</text></a>
        </svg>`, document);
        const anchor = svg?.querySelector("a");

        expect(anchor?.getAttribute("href")).toBe(target);
        expect(anchor?.classList.contains("external-link")).toBe(true);
    });

    it("preserves safe PlantUML style elements and removes unsafe CSS", () => {
        const safe = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}">
            <style>.entity &gt; text, #node { fill: #181818; stroke: rgb(10, 20, 30); font-family: sans-serif; font-size: 14px; }</style>
            <text class="entity" style="fill:#000000;font-family:sans-serif;font-size:14px;opacity:0.8">A</text>
        </svg>`, document);
        expect(safe?.querySelector("style")?.textContent).toContain(".plantuml-svg-sanitized .entity > text");
        expect(safe?.querySelector("style")?.textContent).toContain(".plantuml-svg-sanitized #node");
        expect(safe?.querySelector("text")?.getAttribute("style")).toContain("font-family:sans-serif");

        for (const css of [
            ".x { fill: url(https://unsafe.example/image.svg); }",
            ".x { fill: u\\72l(https://unsafe.example/image.svg); }",
            "@import url(https://unsafe.example/theme.css);",
            "body { display: none; }",
            "svg ~ .lightbox-close { visibility: hidden; }",
            "svg+.lightbox-close { opacity: 0; }",
            ".x { fill: var(--unsafe); }",
        ]) {
            const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}"><style>${css}</style><rect /></svg>`, document);
            expect(svg?.querySelector("style"), css).toBeNull();
        }
    });

    it("rejects selectors that escape to a following host sibling", () => {
        for (const combinator of ["+", "~"]) {
            const host = document.createElement("div");
            const outside = document.createElement("div");
            outside.id = "outside-sibling";
            const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}">
                <style>${combinator} #outside-sibling { visibility: hidden; }</style>
                <rect />
            </svg>`, document);
            host.append(svg as SVGSVGElement, outside);

            expect(svg?.querySelector("style"), combinator).toBeNull();
            expect(outside.id).toBe("outside-sibling");
        }
    });

    it("preserves only base64 raster data images", () => {
        for (const mime of ["png", "jpeg", "gif", "webp"]) {
            const href = `data:image/${mime};base64,AQIDBA==`;
            const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}"><image href="${href}" /></svg>`, document);
            expect(svg?.querySelector("image")?.getAttribute("href")).toBe(href);
        }

        for (const href of [
            "data:image/svg+xml;base64,PHN2Zy8+",
            "data:text/html;base64,PHNjcmlwdD4=",
            "data:image/png,not-base64",
            "https://unsafe.example/image.png",
            "//unsafe.example/image.png",
        ]) {
            const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}"><image href="${href}" /></svg>`, document);
            expect(svg?.querySelector("image")?.hasAttribute("href"), href).toBe(false);
        }
    });

    it("keeps safe internal references, XML attributes, and link behavior", () => {
        const svg = sanitizeSvg(`<svg xmlns="${SVG_NAMESPACE}" xmlns:xlink="${XLINK_NAMESPACE}" xml:lang="en" xml:space="preserve">
            <defs><linearGradient id="gradient" /></defs>
            <rect fill="url(#gradient)" />
            <a href="Folder/Note#Heading" target="_top"><text>internal</text></a>
            <a xlink:href="https://example.com" target="_top"><text>external</text></a>
        </svg>`, document);
        const links = svg?.querySelectorAll("a");

        expect(svg?.getAttributeNS(XML_NAMESPACE, "lang")).toBe("en");
        expect(svg?.getAttributeNS(XML_NAMESPACE, "space")).toBe("preserve");
        expect(svg?.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${svg?.querySelector("linearGradient")?.id})`);
        expect(links?.[0].classList.contains("internal-link")).toBe(true);
        expect(links?.[0].getAttribute("data-href")).toBe("Folder/Note#Heading");
        expect(links?.[0].hasAttribute("target")).toBe(false);
        expect(links?.[1].classList.contains("external-link")).toBe(true);
        expect(links?.[1].getAttribute("target")).toBe("_blank");
        expect(links?.[1].getAttribute("rel")).toBe("noopener");
    });
});

describe("SVG security predicates", () => {
    it("recognizes active elements and unsafe attributes by local name and namespace", () => {
        for (const element of [
            "animate", "animateColor", "animateMotion", "animateTransform", "animation", "color-profile", "discard",
            "font-face-uri", "handler", "listener", "mpath", "prefetch", "script", "set", "future-resource",
        ]) {
            expect(isUnsafeSvgElement(element), element).toBe(true);
        }
        expect(isUnsafeSvgElement("rect")).toBe(false);
        expect(isUnsafeSvgAttribute("path", "style", null, "fill:none;stroke:#181818;stroke-width:1")).toBe(false);
        expect(isUnsafeSvgAttribute("path", "style", null, "fill:u\\72l(https://unsafe.example)")).toBe(true);
        expect(isUnsafeSvgAttribute("rect", "fill", null, "url(#safe-gradient)")).toBe(false);
        expect(isUnsafeSvgAttribute("rect", "fill", null, "url(https://unsafe.example/fill.svg)")).toBe(true);
        expect(isUnsafeSvgAttribute("svg", "base", XML_NAMESPACE, "https://unsafe.example/")).toBe(true);
        expect(isUnsafeSvgAttribute("svg", "custom", "https://unsafe.example/ns", "value")).toBe(true);
        expect(isUnsafeSvgAttribute("svg", "xlink", XMLNS_NAMESPACE, XLINK_NAMESPACE)).toBe(false);
        expect(isUnsafeSvgAttribute("rect", "unknown-resource", null, "https://unsafe.example/")).toBe(true);
        expect(isUnsafeSvgAttribute("rect", "externalResourcesRequired", null, "true")).toBe(true);
    });

    it("allows PlantUML presentation attributes and rejects CSS-based resource bypasses", () => {
        for (const [element, name, value] of [
            ["svg", "style", "width:4421px;height:1599px;background:#FFFFFF;"],
            ["svg", "style", "background-color:rgba(255, 255, 255, 0.5)"],
            ["path", "stroke", "#181818"],
            ["g", "filter", "url(#safe-filter)"],
            ["path", "clip-path", "url( #safe-clip )"],
        ]) {
            expect(isUnsafeSvgAttribute(element, name, null, value), `${name}=${value}`).toBe(false);
        }

        for (const [element, name, value] of [
            ["svg", "style", "background:url(https://unsafe.example/background.svg)"],
            ["svg", "style", "background:u\\72l(https://unsafe.example/background.svg)"],
            ["path", "style", "stroke:red;/* hidden */fill:none"],
            ["path", "style", "animation:pulse 1s infinite"],
            ["path", "style", "position:fixed"],
            ["path", "style", "fill:rgb(10, 20, 30"],
            ["path", "fill", "u\\000072l(//unsafe.example/fill.svg)"],
            ["g", "filter", "URL(data:text/html,unsafe)"],
            ["path", "mask", "image-set(\"https://unsafe.example/mask.svg\")"],
            ["path", "marker-start", "var(--unsafe-resource)"],
        ]) {
            expect(isUnsafeSvgAttribute(element, name, null, value), `${name}=${value}`).toBe(true);
        }
    });

    it("limits links, resource attributes, and namespace declarations", () => {
        for (const [namespace, value] of [
            [null, "https://example.com"],
            [XLINK_NAMESPACE, "relative-note"],
            [null, "obsidian://open?vault=test"],
        ] as const) {
            expect(isUnsafeSvgAttribute("a", "href", namespace, value)).toBe(false);
        }
        expect(isUnsafeSvgAttribute("a", "href", null, "java\nscript:alert(1)")).toBe(true);
        expect(isUnsafeSvgAttribute("a", "href", XLINK_NAMESPACE, "data:text/html,unsafe")).toBe(true);
        for (const attribute of ["ping", "target", "download", "rel", "referrerpolicy", "hreflang", "type"]) {
            expect(isUnsafeSvgAttribute("a", attribute, null, "unsafe"), attribute).toBe(true);
        }
        expect(isUnsafeSvgAttribute("image", "href", XLINK_NAMESPACE, "data:image/png;base64,AQIDBA==")).toBe(false);
        expect(isUnsafeSvgAttribute("image", "href", XLINK_NAMESPACE, "https://unsafe.example/image.png")).toBe(true);
        expect(isUnsafeSvgAttribute("svg", "lang", XML_NAMESPACE, "en")).toBe(false);
        expect(isUnsafeSvgAttribute("svg", "space", XML_NAMESPACE, "preserve")).toBe(false);
        expect(isUnsafeSvgAttribute("svg", "custom", XML_NAMESPACE, "value")).toBe(true);
    });

    it("distinguishes vault links from external and local-fragment links", () => {
        for (const link of ["Note", "folder/Note", "Note#Heading", "Note?query"]) {
            expect(isRelativeVaultLink(link), link).toBe(true);
        }
        for (const link of ["https://example.com", "mailto:user@example.com", "obsidian://open?vault=test", "//example.com", "#local"]) {
            expect(isRelativeVaultLink(link), link).toBe(false);
        }
    });

    it("routes only vault links while stopping Lightbox click propagation", () => {
        const openLinkText = vi.fn();
        const internal = {preventDefault: vi.fn(), stopPropagation: vi.fn()};
        const external = {preventDefault: vi.fn(), stopPropagation: vi.fn()};

        routeSvgAnchorClick("folder/Note", "diagrams/source.md", true, internal, openLinkText);
        routeSvgAnchorClick("https://example.com", "diagrams/source.md", false, external, openLinkText);

        expect(openLinkText).toHaveBeenCalledOnce();
        expect(openLinkText).toHaveBeenCalledWith("folder/Note", "diagrams/source.md", true);
        expect(internal.preventDefault).toHaveBeenCalledOnce();
        expect(internal.stopPropagation).toHaveBeenCalledOnce();
        expect(external.preventDefault).not.toHaveBeenCalled();
        expect(external.stopPropagation).toHaveBeenCalledOnce();
    });
});

describe("SVG text serialization", () => {
    it("joins split glyphs and explicit whitespace but keeps labels and lines separate", () => {
        expect(serializeSvgTextFragments([
            {text: "日", x: 10, y: 20, fontSize: 16, textLength: 16},
            {text: "本", x: 26, y: 20, fontSize: 16, textLength: 16},
            {text: "語", x: 42, y: 20, fontSize: 16, textLength: 16},
        ])).toBe("日本語");
        expect(serializeSvgTextFragments([
            {text: "Approval", x: 10, y: 20, fontSize: 14, textLength: 56},
            {text: "\u00a0", x: 66, y: 20, fontSize: 14, textLength: 7},
            {text: "Gate", x: 73, y: 20, fontSize: 14, textLength: 28},
        ])).toBe("Approval Gate");
        expect(serializeSvgTextFragments([
            {text: "Alpha", x: 10, y: 20, fontSize: 14, textLength: 35},
            {text: "Beta", x: 46, y: 20, fontSize: 14, textLength: 28},
            {text: "second line", x: 10, y: 40, fontSize: 14, textLength: 72},
        ])).toBe("Alpha\nBeta\nsecond line");
        expect(serializeSvgTextFragments([
            {text: "承", x: 10, y: 20, fontSize: 16, textLength: 16},
            {text: "Approval", x: 26, y: 20, fontSize: 16, textLength: 64},
            {text: "Right", x: 180, y: 20, fontSize: 16, textLength: 40},
        ])).toBe("承Approval\nRight");
    });

    it("keeps partial selections and scopes clipboard writes", () => {
        expect(sliceSvgText("PlantUML", 2, 7)).toBe("antUM");
        const event = {
            clipboardData: {setData: vi.fn()},
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };

        expect(copySvgTextToClipboard(event, "日本語", false)).toBe(false);
        expect(event.clipboardData.setData).not.toHaveBeenCalled();
        expect(copySvgTextToClipboard(event, "日本語", true)).toBe(true);
        expect(event.clipboardData.setData).toHaveBeenCalledWith("text/plain", "日本語");
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });
});
