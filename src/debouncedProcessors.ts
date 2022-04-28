import {debounce, Debouncer, MarkdownPostProcessorContext} from "obsidian";
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
        }
    }

}
