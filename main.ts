import {
    App,
    debounce,
    MarkdownPostProcessorContext,
    Notice,
    Plugin,
    PluginSettingTab,
    request,
    Setting
} from 'obsidian';

import * as plantuml from 'plantuml-encoder'

interface PlantUMLSettings {
    server_url: string,
    header: string;
    debounce: number;
}

const DEFAULT_SETTINGS: PlantUMLSettings = {
    server_url: 'https://www.plantuml.com/plantuml',
    header: '',
    debounce: 10,
}

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    imageProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext): Promise<void> => {
        const dest = document.createElement('div');
        let prefix = this.settings.server_url + "/png/";
        source = source.replace(/&nbsp;/gi, " ");

        const encoded = plantuml.encode(this.settings.header + "\r\n" + source);

        const img = document.createElement("img");
        img.src = prefix + encoded;
        img.useMap = "#" + encoded;

        prefix = this.settings.server_url + "/map/";

        dest.innerHTML = await request({url: prefix + encoded, method: "GET"});
        dest.children[0].setAttr("name", encoded);

        dest.appendChild(img);
        el.appendChild(dest);
    };

    asciiProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext): Promise<void> => {
        const prefix = this.settings.server_url + "/txt/";
        source = source.replace(/&nbsp;/gi, " ");

        const encoded = plantuml.encode(this.settings.header + "\r\n" + source);

        const result = await request({url: prefix + encoded});

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        pre.appendChild(code);
        code.setText(result);
        el.appendChild(pre);
    };

    async onload(): Promise<void> {
        console.log('loading plugin plantuml');
        await this.loadSettings();
        this.addSettingTab(new PlantUMLSettingsTab(this.app, this));

        const asciiProcessorDebounce = debounce(this.asciiProcessor, this.settings.debounce, true);
        const imageProcessorDebounce = debounce(this.imageProcessor, this.settings.debounce, true);

        this.registerMarkdownCodeBlockProcessor("plantuml", imageProcessorDebounce);
        this.registerMarkdownCodeBlockProcessor("plantuml-ascii", asciiProcessorDebounce);

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

class PlantUMLSettingsTab extends PluginSettingTab {
    plugin: PlantumlPlugin;

    constructor(app: App, plugin: PlantumlPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl).setName("Server URL")
            .setDesc("PlantUML Server URL")
            .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.server_url)
                .setValue(this.plugin.settings.server_url)
                .onChange(async (value) => {
                        this.plugin.settings.server_url = value;
                        await this.plugin.saveSettings();
                    }
                )
            );
        new Setting(containerEl).setName("Header")
            .setDesc("Included at the head in every diagram. Useful for specifying a common theme (.puml file)")
            .addTextArea(text => {
                    text.setPlaceholder("!include https://raw.githubusercontent.com/....puml\n")
                        .setValue(this.plugin.settings.header)
                        .onChange(async (value) => {
                                this.plugin.settings.header = value;
                                await this.plugin.saveSettings();
                            }
                        )
                    text.inputEl.setAttr("rows", 4);
                    text.inputEl.addClass("settings_area")
                }
            );
        new Setting(containerEl).setName("Debounce")
            .setDesc("How often should the diagram refresh in seconds")
            .addText(text => text.setPlaceholder(String(DEFAULT_SETTINGS.debounce))
                .setValue(String(this.plugin.settings.debounce))
                .onChange(async (value) => {
                    if(!isNaN(Number(value))) {
                        this.plugin.settings.debounce = Number(value);
                        await this.plugin.saveSettings();
                    }else {
                        new Notice("Please specify a valid number");
                    }

                }));
    }
}
