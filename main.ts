import {App, MarkdownPostProcessorContext, Plugin, PluginSettingTab, Setting} from 'obsidian';

import * as plantuml from 'plantuml-encoder'

interface PlantUMLSettings {
    server_url: string,
    header: string;
}

const DEFAULT_SETTINGS: PlantUMLSettings = {
    server_url: 'https://www.plantuml.com/plantuml',
    header: ''
}

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    pngProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const dest = document.createElement('img');
        const prefix = this.settings.server_url + "/png/";
        source = source.replaceAll("&nbsp;", " ");

        const encoded = plantuml.encode(this.settings.header + "\r\n" + source);

        dest.src = prefix + encoded;

        el.appendChild(dest);
    };

    mapProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const dest = document.createElement('div');
        let prefix = this.settings.server_url + "/png/";
        source = source.replaceAll("&nbsp;", " ");

        const encoded = plantuml.encode(this.settings.header + "\r\n" + source);

        const img = document.createElement("img");
        img.src = prefix + encoded;
        img.useMap = "#" + encoded;

        prefix = this.settings.server_url + "/map/";

        const result = await fetch(prefix + encoded, {
            method: "GET"
        });

        if(result.ok) {
            dest.innerHTML = await result.text();
            dest.children[0].setAttr("name", encoded);
            console.log(dest);
        }
        dest.appendChild(img);
        el.appendChild(dest);
    };

    asciiProcessor = async (source: string, el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const prefix = this.settings.server_url + "/txt/";
        source = source.replaceAll("&nbsp;", " ");

        const encoded = plantuml.encode(this.settings.header + "\r\n" + source);
        const result = await fetch(prefix + encoded, {
            method: "GET"
        });

        if(result.ok) {
            const text = await result.text();

            const pre = document.createElement("pre");
            const code = document.createElement("code");
            pre.appendChild(code);
            code.setText(text);
            el.appendChild(pre);
        }
    };

    async onload(): Promise<void> {
        console.log('loading plugin plantuml');
        await this.loadSettings();
        this.addSettingTab(new PlantUMLSettingsTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("plantuml", this.pngProcessor);
        this.registerMarkdownCodeBlockProcessor("plantuml-ascii", this.asciiProcessor);
        this.registerMarkdownCodeBlockProcessor("plantuml-map", this.mapProcessor);
    }

    onunload() : void {
        console.log('unloading plugin plantuml');
    }

    async loadSettings() : Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() : Promise<void> {
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
    }
}
