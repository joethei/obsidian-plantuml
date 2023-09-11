import {debounce, Debouncer, MarkdownPostProcessorContext, Menu, Notice, requestUrl} from "obsidian";
import {v4 as uuidv4} from "uuid";
import PlantumlPlugin from "./main";
import {Processor} from "./processor";

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
                                                    await navigator.clipboard.write([
                                                        new ClipboardItem({
                                                            "image/png": blob
                                                        })
                                                    ]);
                                                    new Notice('Diagram copied to clipboard');
                                                } catch (error) {
                                                    new Notice('An error occurred while copying image to clipboard');
                                                    console.error(error);
                                                }
                                            });
                                        } catch (error) {
                                            new Notice('An error occurred while copying image to clipboard');
                                            console.error(error);
                                        }
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
                    });
                menu.showAtMouseEvent(event);
            })
        }
    }

}
