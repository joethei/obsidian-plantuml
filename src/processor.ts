import {MarkdownPostProcessorContext} from "obsidian";

export interface Processor {
    svg: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void>;
    png: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void>;
    ascii: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void>;
}
