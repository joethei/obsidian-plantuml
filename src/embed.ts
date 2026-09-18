import {Component, EmbedChild, EmbedContext, TFile} from "obsidian";
import PlantumlPlugin from "./main";

export class PumlEmbed extends Component implements EmbedChild {
    plugin: PlantumlPlugin;
    ctx: EmbedContext;
    file: TFile;

    constructor(plugin: PlantumlPlugin, file: TFile, ctx: EmbedContext) {
        super();
        this.plugin = plugin;
        this.file = file;
        this.ctx = ctx;
    }

    async loadFile() {
        const data = await this.plugin.app.vault.cachedRead(this.file);
        await this.plugin.debouncedProcessor.png(data, this.ctx.containerEl, {sourcePath: this.file.path});
    }

}
