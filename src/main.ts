import {
    addIcon, Platform,
    Plugin
} from 'obsidian';
import {DEFAULT_SETTINGS, PlantUMLSettings, PlantUMLSettingsTab} from "./settings";
import {LocalProcessors} from "./localProcessors";
import {DebouncedProcessors} from "./debouncedProcessors";
import {isUsingLivePreviewEnabledEditor, LOGO_SVG} from "./const";
import {Processor} from "./processor";
import {ServerProcessor} from "./serverProcessor";
import {Replacer} from "./functions";

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    serverProcessor: Processor;
    localProcessor: Processor;
    replacer: Replacer;

    getProcessor() : Processor {
        if(Platform.isMobileApp) {
            return this.serverProcessor;
        }
        if(this.settings.localJar.length > 0) {
            return this.localProcessor;
        }
        return this.serverProcessor;
    }

    async onload(): Promise<void> {
        console.log('loading plugin plantuml');
        await this.loadSettings();
        this.addSettingTab(new PlantUMLSettingsTab(this));
        this.replacer = new Replacer(this);

        if(isUsingLivePreviewEnabledEditor()) {
            const view = require("./PumlView");
            addIcon("document-" + view.VIEW_TYPE, LOGO_SVG);
            this.registerView(view.VIEW_TYPE, (leaf) => {
                return new view.PumlView(leaf, this);
            });
            this.registerExtensions(["puml"], view.VIEW_TYPE);
        }

        this.serverProcessor = new ServerProcessor(this);
        if (Platform.isDesktopApp) {
            this.localProcessor = new LocalProcessors(this);
        }

        const processor = new DebouncedProcessors(this);

        this.registerMarkdownCodeBlockProcessor("plantuml", processor.png);
        this.registerMarkdownCodeBlockProcessor("plantuml-ascii", processor.ascii);
        this.registerMarkdownCodeBlockProcessor("plantuml-svg", processor.svg);
        this.registerMarkdownCodeBlockProcessor("puml", processor.png);
        this.registerMarkdownCodeBlockProcessor("puml-svg", processor.svg);
        this.registerMarkdownCodeBlockProcessor("puml-ascii", processor.ascii);

        //keep this processor for backwards compatibility
        this.registerMarkdownCodeBlockProcessor("plantuml-map", processor.png);

    }


    async onunload(): Promise<void> {
        console.log('unloading plugin plantuml');
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
