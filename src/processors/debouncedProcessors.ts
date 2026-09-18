import { debounce, Debouncer, HoverParent, Keymap, Menu, Notice, TFile } from "obsidian";
import PlantumlPlugin from "../main";
import { Processor, ProcessorContext } from "./processor";
import { getInternalLinkText, insertErrorMessage, serializeSvg } from "../functions";

export class DebouncedProcessors implements Processor {

    SECONDS_TO_MS_FACTOR = 1000;

    // keyed by the element the diagram is rendered into, so that re-rendering the same element is debounced
    debouncers = new WeakMap<HTMLElement, Debouncer<[string, HTMLElement, ProcessorContext], unknown>>();
    renderStates = new WeakMap<HTMLElement, {originalSource: string, source: string, ctx: ProcessorContext}>();

    debounceTime: number;
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
        const debounceTime = plugin.settings.debounce;
        this.debounceTime = debounceTime * this.SECONDS_TO_MS_FACTOR;
    }

    default = async(source: string, el: HTMLElement, ctx: ProcessorContext) => {
        await this.png(source, el, ctx);
    }

    png = async (source: string, el: HTMLElement, ctx: ProcessorContext) => {
        await this.processor(source, el, ctx, "png", this.plugin.getProcessor().png);
    }

    ascii = async (source: string, el: HTMLElement, ctx: ProcessorContext) => {
        await this.processor(source, el, ctx, "ascii", this.plugin.getProcessor().ascii);
    }

    svg = async (source: string, el: HTMLElement, ctx: ProcessorContext) => {
        await this.processor(source, el, ctx, "svg", this.plugin.getProcessor().svg);
    }

    processor = async (originalSource: string, el: HTMLElement, ctx: ProcessorContext, filetype: string, processor: (source: string, el: HTMLElement, ctx: ProcessorContext) => Promise<void>) => {
        el.dataset.filetype = filetype;
        el.createEl("h6", {text: "Generating PlantUML diagram", cls: "puml-loading"});

        let source = this.plugin.replacer.decodeWhiteSpaces(originalSource);
        source = this.plugin.replacer.replaceLinks(source, ctx?.sourcePath ?? '', filetype);
        const themeHeader = activeDocument.body.hasClass('theme-dark')
            ? this.plugin.settings.darkHeader
            : this.plugin.settings.lightHeader;
        source = this.plugin.replacer.insertHeaders(source, this.plugin.settings.header, themeHeader);

        const isRerender = this.renderStates.has(el);
        const state = {originalSource, source, ctx};
        this.renderStates.set(el, state);

        const render = async (source: string, el: HTMLElement, ctx: ProcessorContext) => {
            try {
                await processor(source, el, ctx);
            } catch (error) {
                console.error("PlantUML: failed to render diagram", error);
                insertErrorMessage(el, error);
            }
        };

        if (isRerender) {
            this.debouncers.get(el)?.(source, el, ctx);
        } else {
            this.debouncers.set(el, debounce(render, this.debounceTime, true));
            await render(source, el, ctx);
            this.registerLinkHandlers(el);
            el.addEventListener('contextmenu', (event) => {
                const {originalSource, source, ctx} = this.renderStates.get(el) ?? state;

                const menu = new Menu()
                    .addItem(item => {
                        item
                            .setTitle('Copy diagram source')
                            .setIcon('clipboard-copy')
                            .onClick(async () => {
                                await navigator.clipboard.writeText(originalSource);
                            })
                    })
                    .addItem(item => {
                        item
                            .setTitle('Copy diagram')
                            .setIcon('image')
                            .onClick(async () => {
                                const {img, svg, code} = this.getDiagram(el, filetype);
                                if (img) {
                                    this.renderToBlob(
                                        img,
                                        'An error occurred while copying image to clipboard',
                                        async (blob) => {
                                            await navigator.clipboard.write([
                                                new ClipboardItem({
                                                    "image/png": blob
                                                })
                                            ]);
                                            new Notice('Diagram copied to clipboard');
                                        });
                                }

                                if (svg) {
                                    await navigator.clipboard.writeText(serializeSvg(svg));
                                    new Notice('Diagram copied to clipboard');
                                }
                                if (code) {
                                    await navigator.clipboard.writeText(code.innerText);
                                    new Notice('Diagram copied to clipboard');
                                }
                            });
                    })
                    .addItem(item => {
                        item
                            .setTitle('Export diagram')
                            .setIcon('image-file')
                            .onClick(async () => {
                                const {img, svg, code} = this.getDiagram(el, filetype);
                                if (img) {
                                    this.renderToBlob(img, 'An error occurred while exporting the diagram', async (blob) => {
                                        const filename = await this.getFilePath(source, ctx, 'png');
                                        const buffer = await blob.arrayBuffer();
                                        const file = this.getFile(filename);
                                        if (file) {
                                            await this.plugin.app.vault.modifyBinary(file, buffer);
                                        } else {
                                            await this.plugin.app.vault.createBinary(filename, buffer);
                                        }

                                        new Notice(`Diagram exported to '${filename}'`);
                                    });
                                }

                                if (svg) {
                                    await this.saveTextFile(source, ctx, 'svg', serializeSvg(svg));
                                }

                                if (code) {
                                    await this.saveTextFile(source, ctx, 'txt', code.innerText);
                                }
                            })
                    });
                menu.showAtMouseEvent(event);
            })
        }
    }

    /**
     * only the element the processor rendered for the given filetype,
     * other elements in the block (e.g. icons added by Obsidian or other plugins) are ignored
     */
    getDiagram = (el: HTMLElement, filetype: string) => {
        return {
            img: filetype === 'png' ? el.querySelector<HTMLImageElement>(':scope > img') : null,
            svg: filetype === 'svg' ? el.querySelector<SVGSVGElement>(':scope > svg') : null,
            code: filetype === 'ascii' ? el.querySelector<HTMLElement>(':scope > pre > code') : null,
        };
    }

    /**
     * open links to notes inside the current workspace instead of handing the
     * obsidian:// urls of image maps to the OS, which opens the vault again
     */
    registerLinkHandlers = (el: HTMLElement) => {
        const hoverParent: HoverParent = {hoverPopover: null};

        const getLink = (event: MouseEvent) => {
            const target = event.target instanceof Element ? event.target.closest("a, area") : null;
            if (!target || !el.contains(target)) return null;
            const linkText = getInternalLinkText(target, this.plugin.app.vault.getName());
            if (linkText === null) return null;
            const sourcePath = this.renderStates.get(el)?.ctx?.sourcePath ?? '';
            return {target, linkText, sourcePath};
        };

        const onClick = (event: MouseEvent) => {
            if (event.button > 1) return;
            const link = getLink(event);
            if (!link) return;
            event.preventDefault();
            event.stopPropagation();
            void this.plugin.app.workspace.openLinkText(link.linkText, link.sourcePath, Keymap.isModEvent(event));
        };
        el.addEventListener('click', onClick);
        el.addEventListener('auxclick', onClick);

        el.addEventListener('mouseover', (event) => {
            const link = getLink(event);
            if (!link) return;
            //reading view handles hovering svg links with the internal-link class itself, don't show two previews
            event.stopPropagation();
            this.plugin.app.workspace.trigger('hover-link', {
                event,
                source: 'preview',
                hoverParent,
                targetEl: link.target,
                linktext: link.linkText,
                sourcePath: link.sourcePath,
            });
        });
    }

    renderToBlob = (img: HTMLImageElement, errorMessage: string, handleBlob: (blob: Blob) => Promise<void>) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = img.src;
        image.addEventListener('load', () => {
            const canvas = createEl('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
            try {
                canvas.toBlob((blob) => {
                    if (!blob) return;
                    handleBlob(blob).catch(() => {
                        new Notice(errorMessage);
                    });
                });
            } catch (error) {
                new Notice(errorMessage);
                console.error(error);
            }
        });
    }

    getFilename = (source: string, ctx: ProcessorContext) => {
        // try extract the title of the diagram
        const startuml = source.match(/@startuml (.+)/i);
        if (startuml?.length >= 2) {
            return `${startuml[1].trim()}`;
        }

        const now = (new Date()).toISOString().replace(/[:T]+/g, '-');
        const filename = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath).name;
        return `${filename.substring(0, filename.lastIndexOf('.'))}-${now.substring(0, now.lastIndexOf('.'))}`;
    }

    getFolder = async (ctx: ProcessorContext) => {
        let exportPath = this.plugin.settings.exportPath;
        if (!exportPath.startsWith('/')) {
            // relative to the document
            const documentPath = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath).parent;
            exportPath = `${documentPath.path}/${exportPath}`;
        }

        const exists = await this.plugin.app.vault.adapter.exists(exportPath);
        if (!exists) {
            await this.plugin.app.vault.createFolder(exportPath);
        }

        return exportPath;
    }

    getFilePath = async (source: string, ctx: ProcessorContext, type: string) => {

        const filename = this.getFilename(source, ctx);
        const path = await this.getFolder(ctx);

        return `${path}${filename}.${type}`;
    }

    getFile = (fileName: string) => {

        let fName = fileName;
        if (fName.startsWith('/')) {
            fName = fName.substring(1);
        }

        const folderOrFile = this.plugin.app.vault.getAbstractFileByPath(fName);

        if (folderOrFile instanceof TFile) {
            return folderOrFile;
        }

        return undefined;
    }

    saveTextFile = async (source: string, ctx: ProcessorContext, type: string, data: string) => {
        try {
            const filename = await this.getFilePath(source, ctx, type);
            const file = this.getFile(filename);

            if (file) {
                await this.plugin.app.vault.modify(file, data);
            } else {
                await this.plugin.app.vault.create(filename, data);
            }

            new Notice(`Diagram exported to '${filename}'`);
        } catch (error) {
            new Notice('An error occurred while while exporting the diagram');
            console.error(error);
        }
    }
}
