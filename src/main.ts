import {
    MarkdownPostProcessorContext,
    Plugin
} from 'obsidian';

import * as plantuml from 'plantuml-encoder'
import {DEFAULT_SETTINGS, PlantUMLSettings, PlantUMLSettingsTab} from "./settings";
import {Processors} from "./processors";

const SECONDS_TO_MS_FACTOR = 1000;

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    async onload(): Promise<void> {
        console.log('loading plugin plantuml');
        await this.loadSettings();
        this.addSettingTab(new PlantUMLSettingsTab(this));

        let processors = new Processors(this);

        //let debounceTime = this.settings.debounce;
        //console.log("debounce time set to " + debounceTime + " seconds");
        //debounceTime = debounceTime * SECONDS_TO_MS_FACTOR;

        //currently just redirecting to other method to disable debounce, as the first implementation was flawed.
        const imageProcessorDebounce = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
          processors.imageProcessor(source, el, ctx);
        }

        const asciiProcessorDebounce = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            processors.asciiProcessor(source, el, ctx);
        }

        const svgProcessorDebounce = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            processors.svgProcessor(source, el, ctx);
        }

        this.registerMarkdownCodeBlockProcessor("plantuml", imageProcessorDebounce);
        this.registerMarkdownCodeBlockProcessor("plantuml-ascii", asciiProcessorDebounce);
        this.registerMarkdownCodeBlockProcessor("plantuml-svg", svgProcessorDebounce);

        //keep this processor for backwards compatibility
        this.registerMarkdownCodeBlockProcessor("plantuml-map", imageProcessorDebounce);
    }

    onunload(): void {
        console.log('unloading plugin plantuml');
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
