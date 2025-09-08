import {Component, EmbedChild, EmbedContext, TFile} from "obsidian";
import PlantumlPlugin from "./main";
import { DebouncedProcessors } from "./processors/debouncedProcessors";

export class PumlEmbed extends Component implements EmbedChild {
    plugin: PlantumlPlugin;
    ctx: EmbedContext;
    file: TFile;
    debouncedProcessors: DebouncedProcessors;

    constructor(plugin: PlantumlPlugin, file: TFile, ctx: EmbedContext) {
        super();
        this.plugin = plugin;
        this.file = file;
        this.ctx = ctx;
        this.debouncedProcessors = new DebouncedProcessors(plugin);
    }

    async loadFile() {
        const data = await this.plugin.app.vault.cachedRead(this.file);
        await this.debouncedProcessors.png(data, this.ctx.containerEl, this.ctx)
    }

}
