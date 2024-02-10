import { debounce, Debouncer, MarkdownPostProcessorContext, Menu, Notice, TFile } from "obsidian";
import { v4 as uuidv4 } from "uuid";
import PlantumlPlugin from "./main";
import { Processor } from "./processor";

export class DebouncedProcessors implements Processor {

    SECONDS_TO_MS_FACTOR = 1000;

    debounceMap = new Map<string, Debouncer<[string, HTMLElement, MarkdownPostProcessorContext]>>();

    debounceTime: number;
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
        const debounceTime = plugin.settings.debounce;
        this.debounceTime = debounceTime * this.SECONDS_TO_MS_FACTOR;
    }

    png = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        await this.processor(source, el, ctx, "png", this.plugin.getProcessor().png);
    }

    ascii = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        await this.processor(source, el, ctx, "ascii", this.plugin.getProcessor().ascii);
    }

    svg = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        await this.processor(source, el, ctx, "svg", this.plugin.getProcessor().svg);
    }

    processor = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, filetype: string, processor: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void>) => {
        const originalSource = source;
        el.dataset.filetype = filetype;
        el.createEl("h6", {text: "Generating PlantUML diagram", cls: "puml-loading"});

        if (el.dataset.plantumlDebounce) {
            const debounceId = el.dataset.plantumlDebounce;
            if (this.debounceMap.has(debounceId)) {
                await this.debounceMap.get(debounceId)(source, el, ctx);
            }
        } else {
            const func = debounce(processor, this.debounceTime, true);
            const uuid = uuidv4();
            el.dataset.plantumlDebouce = uuid;
            this.debounceMap.set(uuid, func);

            source = this.plugin.replacer.replaceNonBreakingSpaces(source);
            source = this.plugin.replacer.replaceLinks(source, this.plugin.replacer.getPath(ctx), filetype);
            source = this.plugin.settings.header + "\r\n" + source;
            await processor(source, el, ctx);
            el.addEventListener('contextmenu', (event) => {

                const menu = new Menu(this.plugin.app)
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
                                console.log(el);
                                const img = el.querySelector('img');
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

                                const svg = el.querySelector('svg');
                                if (svg) {
                                    await navigator.clipboard.writeText(svg.outerHTML);
                                    new Notice('Diagram copied to clipboard');
                                }
                                const code = el.querySelector('code');
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
                                const img = el.querySelector('img');

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

                                const svg = el.querySelector('svg');
                                if (svg) {
                                    await this.saveTextFile(source, ctx, 'svg', svg.outerHTML);
                                }

                                const code = el.querySelector('code');
                                if (code) {
                                    await this.saveTextFile(source, ctx, 'txt', code.innerText);
                                }
                            })
                    });
                menu.showAtMouseEvent(event);
            })
        }
    }

    renderToBlob = (img: HTMLImageElement, errorMessage: string, handleBlob: (blob: Blob) => Promise<void>) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = img.src;
        image.addEventListener('load', () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
            try {
                canvas.toBlob(async (blob) => {
                    try {
                        await handleBlob(blob);
                    } catch (error) {
                        new Notice(errorMessage);
                        console.error(error);
                    }
                });
            } catch (error) {
                new Notice(errorMessage);
                console.error(error);
            }
        });
    }

    getFilename = (source: string, ctx: MarkdownPostProcessorContext) => {
        // try extract the title of the diagram
        const startuml = source.match(/@startuml (.+)/i);
        if (startuml?.length >= 2) {
            return `${startuml[1].trim()}`;
        }

        const now = (new Date()).toISOString().replace(/[:T]+/g, '-');
        const filename = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath).name;
        return `${filename.substring(0, filename.lastIndexOf('.'))}-${now.substring(0, now.lastIndexOf('.'))}`;
    }

    getFolder = async (ctx: MarkdownPostProcessorContext) => {
        let exportPath = this.plugin.settings.exportPath;
        if (!exportPath.startsWith('/')) {
            // relative to the document
            const documentPath = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath).parent;
            exportPath = `${documentPath.path}/${exportPath}`;
        }

        const exists = await this.plugin.app.vault.adapter.exists(exportPath);
        if (!exists) {
            this.plugin.app.vault.createFolder(exportPath);
        }

        return exportPath;
    }

    getFilePath = async (source: string, ctx: MarkdownPostProcessorContext, type: string) => {

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

    saveTextFile = async (source: string, ctx: MarkdownPostProcessorContext, type: string, data: string) => {
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