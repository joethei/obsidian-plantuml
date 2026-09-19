import {Keymap, Menu, Notice} from "obsidian";
import PlantumlPlugin from "./main";
import {getInternalLinkText, serializeSvg} from "./functions";
import {
    copySvgTextToClipboard,
    routeSvgAnchorClick,
    sanitizeSvg,
    serializeSvgTextFragments,
    sliceSvgText,
    SvgTextFragment,
} from "./svgSecurity";

interface PlantumlLightboxTrigger extends HTMLImageElement { plantumlSvg: SVGSVGElement; }

function svgToDataUri(svg: SVGSVGElement): string {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

function estimateTextLength(text: string, fontSize: number): number {
    return Array.from(text).reduce((length, character) =>
        length + fontSize * ((character.codePointAt(0) ?? 0) <= 0xff ? 0.6 : 1), 0);
}

function selectionWhollyInsideSvg(selection: Selection | null, svg: SVGSVGElement): selection is Selection {
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return false;
    const isInside = (node: Node | null) => Boolean(node && (node === svg || svg.contains(node)));
    return isInside(selection.anchorNode) && isInside(selection.focusNode);
}

function svgTextFragments(svg: SVGSVGElement, selection?: Selection): SvgTextFragment[] {
    const ownerDocument = svg.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) return [];
    const selectedRange = selection?.getRangeAt(0);

    return Array.from(svg.querySelectorAll<SVGTextElement>("text")).flatMap(element => {
        const fullText = element.textContent ?? "";
        if (!fullText) return [];

        let text = fullText;
        let selectionStart = 0;
        let selectionEnd = fullText.length;
        if (selectedRange) {
            const selectedParts: Array<{start: number; end: number; text: string}> = [];
            const walker = ownerDocument.createTreeWalker(element, ownerWindow.NodeFilter.SHOW_TEXT);
            let textOffset = 0;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const textNode = node as Text;
                const nodeLength = textNode.data.length;
                if (selectedRange.intersectsNode(textNode)) {
                    const intersection = selectedRange.cloneRange();
                    const nodeRange = ownerDocument.createRange();
                    nodeRange.selectNodeContents(textNode);
                    if (intersection.compareBoundaryPoints(ownerWindow.Range.START_TO_START, nodeRange) < 0) {
                        intersection.setStart(textNode, 0);
                    }
                    if (intersection.compareBoundaryPoints(ownerWindow.Range.END_TO_END, nodeRange) > 0) {
                        intersection.setEnd(textNode, nodeLength);
                    }
                    const start = intersection.startContainer === textNode ? intersection.startOffset : 0;
                    const end = intersection.endContainer === textNode ? intersection.endOffset : nodeLength;
                    if (end > start) {
                        selectedParts.push({
                            start: textOffset + start,
                            end: textOffset + end,
                            text: sliceSvgText(textNode.data, start, end),
                        });
                    }
                }
                textOffset += nodeLength;
            }
            if (selectedParts.length === 0) return [];
            selectionStart = selectedParts[0].start;
            selectionEnd = selectedParts[selectedParts.length - 1].end;
            text = selectedParts.map(part => part.text).join("");
        }

        const computedStyle = ownerWindow.getComputedStyle(element);
        const fontSize = Number.parseFloat(element.getAttribute("font-size") ?? computedStyle.fontSize) || 16;
        const declaredTextLength = Number.parseFloat(element.getAttribute("textLength") ?? "");
        const measuredTextLength = Number.isFinite(declaredTextLength)
            ? declaredTextLength
            : element.getComputedTextLength?.() || estimateTextLength(fullText, fontSize);
        const startRatio = selectionStart / fullText.length;
        const lengthRatio = (selectionEnd - selectionStart) / fullText.length;
        return [{
            text,
            x: (Number.parseFloat(element.getAttribute("x") ?? "0") || 0) + measuredTextLength * startRatio,
            y: Number.parseFloat(element.getAttribute("y") ?? "0") || 0,
            fontSize,
            textLength: measuredTextLength * lengthRatio,
        }];
    });
}

function enhanceNativeSvgLightbox(sourceImage: PlantumlLightboxTrigger, plugin: PlantumlPlugin, sourcePath: string, attempts = 0): void {
    const ownerDocument = sourceImage.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) return;

    const lightbox = Array.from(ownerDocument.querySelectorAll<HTMLElement>(".lightbox")).find(candidate =>
        !candidate.classList.contains("plantuml-svg-lightbox")
        && candidate.querySelector<HTMLImageElement>(".lightbox-media .media-wrapper img")?.src === sourceImage.src);
    if (!lightbox) {
        if (attempts < 60 && sourceImage.isConnected) {
            ownerWindow.requestAnimationFrame(() => enhanceNativeSvgLightbox(sourceImage, plugin, sourcePath, attempts + 1));
        } else {
            sourceImage.remove();
        }
        return;
    }

    const mediaWrapper = lightbox.querySelector<HTMLElement>(".lightbox-media .media-wrapper");
    const nativeImage = lightbox.querySelector<HTMLImageElement>(".lightbox-media .media-wrapper img");
    if (!mediaWrapper || !nativeImage) {
        sourceImage.remove();
        return;
    }

    const svg = sourceImage.plantumlSvg.cloneNode(true) as SVGSVGElement;
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.classList.add("plantuml-svg-lightbox-inline");
    lightbox.classList.add("plantuml-svg-lightbox");
    let activeMenu: Menu | null = null;
    let contextMenuSelection = "";

    const syncNativeImage = () => {
        const computed = ownerWindow.getComputedStyle(nativeImage);
        svg.style.left = `${nativeImage.offsetLeft}px`;
        svg.style.top = `${nativeImage.offsetTop}px`;
        svg.style.width = `${nativeImage.offsetWidth}px`;
        svg.style.height = `${nativeImage.offsetHeight}px`;
        svg.style.transform = nativeImage.style.transform || computed.transform;
        svg.style.transformOrigin = nativeImage.style.transformOrigin || computed.transformOrigin;
        svg.style.transition = nativeImage.style.transition || computed.transition;
    };
    const onSvgClick = (event: MouseEvent) => {
        if (event.button > 1) return;
        const target = event.target;
        const anchor = target instanceof ownerWindow.Element ? target.closest("a") : null;
        if (!anchor) {
            event.stopPropagation();
            return;
        }

        const href = anchor.getAttribute("href") ?? anchor.getAttribute("xlink:href") ?? "";
        const linkText = getInternalLinkText(anchor, plugin.app.vault.getName());
        routeSvgAnchorClick(
            linkText ?? href,
            sourcePath,
            Keymap.isModEvent(event),
            event,
            (target, path, newLeaf) => void plugin.app.workspace.openLinkText(target, path, newLeaf),
        );
    };
    const selectedSvgText = () => {
        const selection = ownerWindow.getSelection();
        return selectionWhollyInsideSvg(selection, svg)
            ? serializeSvgTextFragments(svgTextFragments(svg, selection))
            : "";
    };
    const snapshotContextMenuSelection = (event: MouseEvent) => {
        if (event.button !== 2) return;
        const selectedText = selectedSvgText();
        if (selectedText) contextMenuSelection = selectedText;
    };
    const stopInteractivePointerEvent = (event: MouseEvent) => {
        const target = event.target;
        if (event.button <= 1 && target instanceof ownerWindow.Element && target.closest("text, tspan, textPath, a")) {
            event.stopPropagation();
        }
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
            const selection = ownerWindow.getSelection();
            const range = ownerDocument.createRange();
            range.selectNodeContents(svg);
            selection?.removeAllRanges();
            selection?.addRange(range);
            event.preventDefault();
            event.stopPropagation();
        }
    };
    const onCopy = (event: ClipboardEvent) => {
        const selection = ownerWindow.getSelection();
        const selectionInsideSvg = selectionWhollyInsideSvg(selection, svg);
        const text = selectionInsideSvg ? serializeSvgTextFragments(svgTextFragments(svg, selection)) : "";
        copySvgTextToClipboard(event, text, selectionInsideSvg);
    };
    const allSvgText = () => serializeSvgTextFragments(svgTextFragments(svg));
    const writeClipboardText = async (text: string, notice: string) => {
        if (!text) return;
        try {
            await ownerWindow.navigator.clipboard.writeText(text);
            new Notice(notice);
        } catch {
            new Notice("Failed to copy diagram text");
        }
    };
    const onSvgContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const selectedText = selectedSvgText() || contextMenuSelection;
        contextMenuSelection = "";
        activeMenu?.close();
        const menu = new Menu();
        activeMenu = menu;
        menu.onHide(() => {
            if (activeMenu === menu) activeMenu = null;
        });
        if (selectedText) {
            menu.addItem(item => item
                .setTitle("Copy selected text")
                .setIcon("copy")
                .onClick(() => void writeClipboardText(selectedText, "Copied selected diagram text")));
        }
        menu.addItem(item => item
            .setTitle("Copy all diagram text")
            .setIcon("copy")
            .onClick(() => void writeClipboardText(allSvgText(), "Copied all diagram text")));
        menu.showAtMouseEvent(event);
    };

    const styleObserver = new ownerWindow.MutationObserver(syncNativeImage);
    styleObserver.observe(nativeImage, {attributes: true, attributeFilter: ["class", "style"]});
    const resizeObserver = typeof ownerWindow.ResizeObserver === "undefined"
        ? null
        : new ownerWindow.ResizeObserver(syncNativeImage);
    resizeObserver?.observe(nativeImage);
    resizeObserver?.observe(mediaWrapper);

    let lifecycleObserver: MutationObserver;
    const cleanup = () => {
        contextMenuSelection = "";
        activeMenu?.close();
        activeMenu = null;
        styleObserver.disconnect();
        resizeObserver?.disconnect();
        lifecycleObserver.disconnect();
        svg.removeEventListener("click", onSvgClick);
        svg.removeEventListener("auxclick", onSvgClick);
        svg.removeEventListener("pointerdown", stopInteractivePointerEvent);
        svg.removeEventListener("mousedown", stopInteractivePointerEvent);
        mediaWrapper.removeEventListener("pointerdown", snapshotContextMenuSelection);
        mediaWrapper.removeEventListener("mousedown", snapshotContextMenuSelection);
        mediaWrapper.removeEventListener("contextmenu", onSvgContextMenu);
        ownerWindow.removeEventListener("keydown", onKeyDown, true);
        ownerWindow.removeEventListener("copy", onCopy, true);
    };
    lifecycleObserver = new ownerWindow.MutationObserver(() => {
        if (!lightbox.isConnected) cleanup();
    });
    lifecycleObserver.observe(ownerDocument.body, {childList: true, subtree: true});

    svg.addEventListener("click", onSvgClick);
    svg.addEventListener("auxclick", onSvgClick);
    svg.addEventListener("pointerdown", stopInteractivePointerEvent);
    svg.addEventListener("mousedown", stopInteractivePointerEvent);
    mediaWrapper.addEventListener("pointerdown", snapshotContextMenuSelection);
    mediaWrapper.addEventListener("mousedown", snapshotContextMenuSelection);
    mediaWrapper.addEventListener("contextmenu", onSvgContextMenu);
    ownerWindow.addEventListener("keydown", onKeyDown, true);
    ownerWindow.addEventListener("copy", onCopy, true);
    nativeImage.classList.add("plantuml-svg-lightbox-native");
    mediaWrapper.appendChild(svg);
    syncNativeImage();
    sourceImage.remove();
}

export function registerSvgLightbox(el: HTMLElement, plugin: PlantumlPlugin, sourcePath: string): void {
    const svg = el.querySelector<SVGSVGElement>(":scope > svg");
    if (!svg || svg.dataset.plantumlLightboxRegistered === "true") return;
    svg.dataset.plantumlLightboxRegistered = "true";

    svg.addEventListener("click", event => {
        if (event.button !== 0) return;
        const target = event.target;
        const ownerWindow = svg.ownerDocument.defaultView;
        if (!ownerWindow || target instanceof ownerWindow.Element && target.closest("a")) return;

        const sanitized = sanitizeSvg(serializeSvg(svg), svg.ownerDocument);
        if (!sanitized) return;
        event.preventDefault();
        event.stopPropagation();

        const trigger = svg.ownerDocument.createElement("img") as PlantumlLightboxTrigger;
        trigger.plantumlSvg = sanitized;
        trigger.src = svgToDataUri(sanitized);
        trigger.alt = "PlantUML diagram";
        trigger.title = sanitized.querySelector("title")?.textContent?.trim() || "PlantUML diagram";
        trigger.dataset.plantumlLightboxTrigger = "true";
        trigger.classList.add("plantuml-svg-lightbox-trigger");
        el.appendChild(trigger);
        trigger.click();
        svg.ownerDocument.defaultView?.requestAnimationFrame(() => enhanceNativeSvgLightbox(trigger, plugin, sourcePath));
    });
}
