export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
export const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

const SAFE_SVG_ELEMENTS = new Set([
    "a", "circle", "clippath", "defs", "desc", "ellipse",
    "feblend", "fecolormatrix", "fecomponenttransfer", "fecomposite", "feconvolvematrix",
    "fediffuselighting", "fedisplacementmap", "fedistantlight", "fedropshadow", "feflood",
    "fefunca", "fefuncb", "fefuncg", "fefuncr", "fegaussianblur", "femerge", "femergenode",
    "femorphology", "feoffset", "fepointlight", "fespecularlighting", "fespotlight", "fetile",
    "feturbulence", "filter", "g", "image", "line", "lineargradient", "marker", "mask", "metadata",
    "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "svg",
    "symbol", "text", "textpath", "title", "tspan", "use", "view",
]);

const SAFE_SVG_ATTRIBUTES = new Set([
    "alignment-baseline", "aria-describedby", "aria-label", "aria-labelledby", "baseline-shift", "class",
    "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-rendering",
    "contentstyletype", "cx", "cy", "d", "data-source-line", "direction", "display", "dominant-baseline",
    "dx", "dy", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color",
    "flood-opacity", "font-family", "font-size", "font-stretch", "font-style", "font-variant",
    "font-weight", "gradienttransform", "gradientunits", "height", "id", "image-rendering", "in", "in2",
    "k1", "k2", "k3", "k4", "kernelmatrix", "lengthadjust", "letter-spacing", "lighting-color",
    "marker-end", "markerheight", "marker-mid", "marker-start", "markerunits", "markerwidth", "mask",
    "maskcontentunits", "maskunits", "mode", "numoctaves", "offset", "opacity", "operator", "order",
    "orient", "overflow", "paint-order", "pathlength", "patterncontentunits", "patterntransform", "patternunits",
    "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "radius", "refx", "refy",
    "result", "role", "rotate", "rx", "ry", "scale", "seed", "shape-rendering", "slope", "spacing",
    "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles",
    "stop-color", "stop-opacity", "stroke", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap",
    "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width", "style", "surfacescale",
    "targetx", "targety", "text-anchor", "text-decoration", "text-rendering", "textlength", "transform",
    "type", "values", "vector-effect", "version", "viewbox", "visibility", "width", "word-spacing",
    "writing-mode", "x", "x1", "x2", "y", "y1", "y2", "zoomandpan",
]);

const ANCHOR_NAVIGATION_ATTRIBUTES = new Set([
    "download",
    "hreflang",
    "ping",
    "referrerpolicy",
    "rel",
    "target",
    "type",
]);

const URL_PRESENTATION_ATTRIBUTES = new Set([
    "clip-path",
    "fill",
    "filter",
    "marker",
    "marker-end",
    "marker-mid",
    "marker-start",
    "mask",
    "stroke",
]);

const SAFE_STYLE_PROPERTIES = new Set([
    "alignment-baseline",
    "background",
    "background-color",
    "baseline-shift",
    "color",
    "dominant-baseline",
    "fill",
    "fill-opacity",
    "fill-rule",
    "font-family",
    "font-size",
    "font-stretch",
    "font-style",
    "font-variant",
    "font-weight",
    "height",
    "letter-spacing",
    "opacity",
    "paint-order",
    "shape-rendering",
    "stop-color",
    "stop-opacity",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "text-decoration",
    "text-rendering",
    "vector-effect",
    "visibility",
    "width",
    "word-spacing",
]);

const SAFE_CSS_SELECTOR = /^[a-zA-Z0-9_.#,+>~\s-]+$/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;
const SANITIZED_SVG_CLASS = "plantuml-svg-sanitized";

export interface SvgTextFragment {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    textLength: number;
}

interface SvgTextCopyEvent {
    clipboardData: {setData(type: string, value: string): void} | null;
    preventDefault(): void;
    stopPropagation(): void;
}

export function sliceSvgText(text: string, start: number, end: number): string {
    return text.slice(start, end);
}

export function serializeSvgTextFragments(fragments: SvgTextFragment[]): string {
    const normalized = fragments
        .map(fragment => ({...fragment, text: fragment.text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")}))
        .filter(fragment => fragment.text.length > 0);
    if (normalized.length === 0) return "";

    let result = normalized[0].text;
    for (let index = 1; index < normalized.length; index++) {
        const previous = normalized[index - 1];
        const current = normalized[index];
        const fontSize = Math.max(previous.fontSize, current.fontSize, 1);
        const sameBaseline = Math.abs(current.y - previous.y) <= fontSize * 0.35;
        const gap = current.x - (previous.x + previous.textLength);
        const adjacent = gap >= -fontSize * 0.35 && gap <= fontSize * 0.75;
        const canJoin = Array.from(previous.text).length === 1
            || Array.from(current.text).length === 1
            || /^\s+$/.test(previous.text)
            || /^\s+$/.test(current.text);
        result += sameBaseline && adjacent && canJoin ? current.text : `\n${current.text}`;
    }

    return result
        .split("\n")
        .map(line => line.trimEnd())
        .join("\n")
        .replace(/^\n+|\n+$/g, "");
}

export function copySvgTextToClipboard(event: SvgTextCopyEvent, text: string, selectionInsideSvg: boolean): boolean {
    if (!selectionInsideSvg || !text || !event.clipboardData) return false;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    event.stopPropagation();
    return true;
}

function stripControlWhitespace(value: string): string {
    return Array.from(value).filter(character => character.charCodeAt(0) > 32).join("");
}

function hasControlCharacter(value: string, allowCssWhitespace = false): boolean {
    return Array.from(value).some(character => {
        const code = character.charCodeAt(0);
        return code === 127 || code < 32 && (!allowCssWhitespace || ![9, 10, 13].includes(code));
    });
}

type SvgUrlKind = "fragment" | "vault" | "external" | "unsafe";

interface SvgUrlClassification {
    kind: SvgUrlKind;
    target: string;
}

function classifySvgUrl(value: string): SvgUrlClassification {
    const rawTarget = value.trim();
    if (!rawTarget || hasControlCharacter(rawTarget)) return {kind: "unsafe", target: ""};

    let target = rawTarget;
    for (let pass = 0; pass < 8; pass++) {
        let decoded: string;
        try {
            decoded = decodeURIComponent(target);
        } catch {
            return {kind: "unsafe", target: ""};
        }
        if (decoded === target) break;
        target = decoded;
        if (pass === 7) return {kind: "unsafe", target: ""};
    }
    target = target.trim();
    if (!target || hasControlCharacter(target)) return {kind: "unsafe", target: ""};
    if (target.startsWith("#")) return {kind: "fragment", target};
    if (target.startsWith("/") || target.startsWith("\\") || target.startsWith("?")) {
        return {kind: "unsafe", target: ""};
    }

    const compactTarget = stripControlWhitespace(target);
    const scheme = compactTarget.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme) {
        const rawScheme = stripControlWhitespace(rawTarget).match(/^([a-z][a-z0-9+.-]*):/i);
        const name = scheme[1].toLowerCase();
        if (!rawScheme || rawScheme[1].toLowerCase() !== name || compactTarget !== target) {
            return {kind: "unsafe", target: ""};
        }
        return ["http", "https", "mailto", "obsidian"].includes(name)
            ? {kind: "external", target}
            : {kind: "unsafe", target: ""};
    }
    return {kind: "vault", target};
}

function isSafeDataImage(value: string): boolean {
    return SAFE_DATA_IMAGE.test(value.trim());
}

function isSafePresentationValue(value: string): boolean {
    if (/[\\{}@]|\/\*|\*\//.test(value) || hasControlCharacter(value, true)) return false;

    const withoutLocalUrls = value.replace(/url\s*\(\s*(['"]?)\s*#[^'"\s)]+\s*\1\s*\)/gi, "");
    return !/(?:url|var|attr|env|image|image-set|cross-fade|element|paint)\s*\(/i.test(withoutLocalUrls)
        && !/(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(withoutLocalUrls);
}

function isSafeStyleValue(value: string): boolean {
    if (!/^[\w\s#.,%()+\-'"/]+$/.test(value)) return false;

    const functions = Array.from(value.matchAll(/([a-z][\w-]*)\s*\(/gi), match => match[1].toLowerCase());
    if (functions.some(name => !["hsl", "hsla", "rgb", "rgba"].includes(name))) return false;

    let quote = "";
    let parentheses = 0;
    for (const character of value) {
        if (quote) {
            if (character === quote) quote = "";
        } else if (character === "\"" || character === "'") {
            quote = character;
        } else if (character === "(") {
            parentheses++;
        } else if (character === ")" && --parentheses < 0) {
            return false;
        }
    }
    return !quote && parentheses === 0;
}

function isSafeStyle(value: string): boolean {
    if (!value || /[\\{}@]|\/\*|\*\//.test(value)) return false;

    const declarations = value.split(";");
    if (declarations[declarations.length - 1].trim() === "") declarations.pop();
    if (declarations.length === 0) return false;

    return declarations.every(declaration => {
        const separator = declaration.indexOf(":");
        if (separator <= 0 || separator !== declaration.lastIndexOf(":")) return false;

        const property = declaration.slice(0, separator).trim().toLowerCase();
        const propertyValue = declaration.slice(separator + 1).trim();
        return SAFE_STYLE_PROPERTIES.has(property)
            && propertyValue.length > 0
            && !hasControlCharacter(propertyValue)
            && !/(?:url|var|expression|attr|env|image|image-set)\s*\(/i.test(propertyValue)
            && isSafeStyleValue(propertyValue);
    });
}

function sanitizeStyleSheet(css: string): string | null {
    if (!css.trim() || /[\\@<]|\/\*|\*\//.test(css) || hasControlCharacter(css, true)) return null;

    const blocks: string[] = [];
    let lastIndex = 0;
    const rule = /([^{}]+)\{([^{}]+)\}/g;
    for (let match = rule.exec(css); match; match = rule.exec(css)) {
        if (css.slice(lastIndex, match.index).trim()) return null;
        const selectors = match[1].split(",").map(selector => selector.trim());
        if (selectors.length === 0 || selectors.some(selector => !selector
            || !SAFE_CSS_SELECTOR.test(selector)
            || /^svg(?:$|[\s.#>+~])/i.test(selector) && /[+~]/.test(selector)
            || /(^|[\s>+~])(body|html)(?=$|[\s>+~.#])/i.test(selector))) {
            return null;
        }
        const declarations = match[2].trim();
        if (!isSafeStyle(declarations)) return null;
        const scopedSelectors = selectors.map(selector => {
            if (/^svg(?:$|[\s>+~.#])/i.test(selector)) {
                return selector.replace(/^svg/i, `.${SANITIZED_SVG_CLASS}`);
            }
            return `.${SANITIZED_SVG_CLASS} ${selector}`;
        });
        blocks.push(`${scopedSelectors.join(", ")} { ${declarations} }`);
        lastIndex = rule.lastIndex;
    }
    if (blocks.length === 0 || css.slice(lastIndex).trim()) return null;
    return blocks.join("\n");
}

export function isUnsafeSvgElement(tagName: string): boolean {
    return !SAFE_SVG_ELEMENTS.has(tagName.toLowerCase());
}

export function isRelativeVaultLink(value: string): boolean {
    return classifySvgUrl(value).kind === "vault";
}

interface SvgAnchorClickEvent {
    preventDefault(): void;
    stopPropagation(): void;
}

export function routeSvgAnchorClick<T>(
    target: string,
    sourcePath: string,
    newLeaf: T,
    event: SvgAnchorClickEvent,
    openLinkText: (target: string, sourcePath: string, newLeaf: T) => unknown,
): void {
    event.stopPropagation();
    const classified = classifySvgUrl(target);
    if (classified.kind !== "vault") return;

    event.preventDefault();
    openLinkText(classified.target, sourcePath, newLeaf);
}

export function isUnsafeSvgAttribute(
    elementLocalName: string,
    attributeLocalName: string,
    namespaceURI: string | null,
    value: string,
): boolean {
    if (namespaceURI === XMLNS_NAMESPACE) {
        return elementLocalName.toLowerCase() !== "svg"
            || !((attributeLocalName === "xmlns" && value === SVG_NAMESPACE)
                || (attributeLocalName === "xlink" && value === XLINK_NAMESPACE));
    }
    if (namespaceURI === XML_NAMESPACE) return !["lang", "space"].includes(attributeLocalName);
    if (namespaceURI && namespaceURI !== XLINK_NAMESPACE) return true;

    const elementName = elementLocalName.toLowerCase();
    const name = attributeLocalName.toLowerCase();
    if (namespaceURI === XLINK_NAMESPACE && name !== "href") return true;
    if (name.startsWith("on")) return true;
    if (elementName === "a" && ANCHOR_NAVIGATION_ATTRIBUTES.has(name)) return true;

    if (name === "href") {
        if (elementName === "image" && isSafeDataImage(value)) return false;
        const classified = classifySvgUrl(value);
        if (elementName === "a") return classified.kind === "unsafe";
        return !["clippath", "filter", "lineargradient", "marker", "mask", "pattern", "radialgradient", "textpath", "use"].includes(elementName)
            || classified.kind !== "fragment";
    }
    if (!SAFE_SVG_ATTRIBUTES.has(name)) return true;
    if (name === "style") return !isSafeStyle(value);
    if (URL_PRESENTATION_ATTRIBUTES.has(name)) return !isSafePresentationValue(value);
    if (/url\s*\(/i.test(value)) return true;
    return hasControlCharacter(value);
}

export function sanitizeSvg(svgText: string, ownerDocument: Document): SVGSVGElement | null {
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) return null;

    const parsed = new ownerWindow.DOMParser().parseFromString(svgText, "image/svg+xml");
    const root = parsed.documentElement;
    if (parsed.querySelector("parsererror") || root.localName.toLowerCase() !== "svg" || root.namespaceURI !== SVG_NAMESPACE) {
        return null;
    }

    const elements = [root, ...Array.from(parsed.querySelectorAll("*"))];
    for (const element of elements) {
        if (element.namespaceURI !== SVG_NAMESPACE || isUnsafeSvgElement(element.localName)) {
            element.remove();
            continue;
        }
        for (const attribute of Array.from(element.attributes)) {
            if (isUnsafeSvgAttribute(element.localName, attribute.localName, attribute.namespaceURI, attribute.value)) {
                element.removeAttributeNode(attribute);
            } else if (attribute.localName.toLowerCase() === "href" && element.localName.toLowerCase() !== "image") {
                attribute.value = classifySvgUrl(attribute.value).target;
            }
        }
        if (element.localName.toLowerCase() === "style") {
            const css = sanitizeStyleSheet(element.textContent ?? "");
            if (css === null) {
                element.remove();
            } else {
                element.textContent = css;
            }
        }
    }

    root.classList.add(SANITIZED_SVG_CLASS);
    for (const anchor of Array.from(root.querySelectorAll("a"))) {
        const target = anchor.getAttribute("href") ?? anchor.getAttributeNS(XLINK_NAMESPACE, "href");
        if (!target) continue;
        const classified = classifySvgUrl(target);
        anchor.removeAttributeNS(XLINK_NAMESPACE, "href");
        anchor.setAttribute("href", classified.target);
        if (classified.kind === "vault") {
            anchor.classList.add("internal-link");
            anchor.setAttribute("data-href", classified.target);
        } else if (classified.kind === "external") {
            anchor.classList.add("external-link");
            anchor.setAttribute("target", "_blank");
            anchor.setAttribute("rel", "noopener");
        }
    }

    return ownerDocument.importNode(root, true) as unknown as SVGSVGElement;
}
