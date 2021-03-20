import {
    Plugin,
    MarkdownPostProcessor,
    MarkdownPostProcessorContext,
    MarkdownPreviewRenderer,
    PluginSettingTab,
    App,
    Setting
} from 'obsidian';

import * as plantuml from 'plantuml-encoder'

interface PlantUMLSettings {
    server_url: string,
    header: string;
}

const DEFAULT_SETTINGS: PlantUMLSettings = {
    server_url: 'https://plantuml.com/plantuml',
    header: ''
}

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    postprocessor: MarkdownPostProcessor = async (el: HTMLElement, _: MarkdownPostProcessorContext) => {
        const blockToReplace = el.querySelector('pre');
        if (!blockToReplace) return;

        const block = blockToReplace.querySelector('code.language-plantuml');
        if (!block) return;

        const dest = document.createElement('img');

        const prefix = this.settings.server_url + "/png/";
        const encoded = plantuml.encode(this.settings.header + block.textContent);

        dest.src = prefix + encoded;

        el.replaceChild(dest, blockToReplace);
    }

    async onload(): Promise<void> {
        console.log('loading plugin plantuml');
        await this.loadSettings();
        MarkdownPreviewRenderer.registerPostProcessor(this.postprocessor);
        this.addSettingTab(new PlantUMLSettingsTab(this.app, this));
    }

    onunload() : void {
        console.log('unloading plugin plantuml');
        MarkdownPreviewRenderer.unregisterPostProcessor(this.postprocessor);
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

