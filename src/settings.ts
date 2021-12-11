import {Notice, PluginSettingTab, Setting} from "obsidian";
import PlantumlPlugin from "./main";

export interface PlantUMLSettings {
    server_url: string,
    header: string;
    debounce: number;
}

export const DEFAULT_SETTINGS: PlantUMLSettings = {
    server_url: 'https://www.plantuml.com/plantuml',
    header: '',
    debounce: 3,
}

export class PlantUMLSettingsTab extends PluginSettingTab {
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        super(plugin.app, plugin);
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
                    //make sure that there is always some value defined, or reset to default
                    if (!isNaN(Number(value)) || value === undefined) {
                        this.plugin.settings.debounce = Number(value || DEFAULT_SETTINGS.debounce);
                        await this.plugin.saveSettings();
                    } else {
                        new Notice("Please specify a valid number");
                    }
                }));
    }
}
