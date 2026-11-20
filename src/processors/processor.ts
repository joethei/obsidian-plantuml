import {MarkdownPostProcessorContext} from "obsidian";

/**
 * the part of the post processor context the processors rely on,
 * so that embeds, the file view and hover previews can supply it as well
 */
export type ProcessorContext = Pick<MarkdownPostProcessorContext, "sourcePath"> & {
    /** shown below the diagram, e.g. the display text of an embed (`![[diagram.puml|caption]]`) */
    caption?: string;
};

export interface Processor {
    svg: (source: string, el: HTMLElement, ctx: ProcessorContext) => Promise<void>;
    png: (source: string, el: HTMLElement, ctx: ProcessorContext) => Promise<void>;
    ascii: (source: string, el: HTMLElement, ctx: ProcessorContext) => Promise<void>;
}
