import {
    debounce, Debouncer,
    MarkdownPostProcessorContext,
    Plugin
} from 'obsidian';
import {DEFAULT_SETTINGS, PlantUMLSettings, PlantUMLSettingsTab} from "./settings";
import {Processors} from "./processors";
import { v4 as uuidv4 } from 'uuid';

const SECONDS_TO_MS_FACTOR = 1000;

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    debounceMap = new Map<string, Debouncer<[string, HTMLElement, MarkdownPostProcessorContext]>>();

    async onload(): Promise<void> {
        console.log('loading plugin plantuml');
        await this.loadSettings();
        this.addSettingTab(new PlantUMLSettingsTab(this));

        const processors = new Processors(this);

        let debounceTime = this.settings.debounce;
        debounceTime = debounceTime * SECONDS_TO_MS_FACTOR;

        const imageProcessorDebounce = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            if(el.dataset.plantumlDebounce) {
                const debounceId = el.dataset.plantumlDebounce;
                if (this.debounceMap.has(debounceId)) {
                    this.debounceMap.get(debounceId)(source, el, ctx);
                }
            }else {
                const func = debounce(processors.imageProcessor, debounceTime, true);
                const uuid = uuidv4();
                el.dataset.plantumlDebouce = uuid;
                this.debounceMap.set(uuid, func);
                func(source, el, ctx);
            }
        }

        const asciiProcessorDebounce = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            if(el.dataset.plantumlDebounce) {
                const debounceId = el.dataset.plantumlDebounce;
                if (this.debounceMap.has(debounceId)) {
                    this.debounceMap.get(debounceId)(source, el, ctx);
                }
            }else {
                const func = debounce(processors.asciiProcessor, debounceTime, true);
                const uuid = uuidv4();
                el.dataset.plantumlDebouce = uuid;
                this.debounceMap.set(uuid, func);
                func(source, el, ctx);
            }
        }

        const svgProcessorDebounce = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            if(el.dataset.plantumlDebounce) {
                const debounceId = el.dataset.plantumlDebounce;
                if (this.debounceMap.has(debounceId)) {
                    this.debounceMap.get(debounceId)(source, el, ctx);
                }
            }else {
                const func = debounce(processors.svgProcessor, debounceTime, true);
                const uuid = uuidv4();
                el.dataset.plantumlDebouce = uuid;
                this.debounceMap.set(uuid, func);
                func(source, el, ctx);
            }
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
