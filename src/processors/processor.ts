import {EmbedContext, MarkdownPostProcessorContext} from "obsidian";

export interface Processor {
    svg: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext | EmbedContext) => Promise<void>;
    png: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext | EmbedContext) => Promise<void>;
    ascii: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext | EmbedContext) => Promise<void>;
}
