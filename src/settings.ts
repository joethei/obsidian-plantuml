import {Notice, Platform, PluginSettingTab, Setting} from "obsidian";
import PlantumlPlugin from "./main";

export interface PlantUMLSettings {
    server_url: string,
    header: string;
    debounce: number;
    localJar: string;
    javaPath: string;
    defaultProcessor: string;
}

export const DEFAULT_SETTINGS: PlantUMLSettings = {
    server_url: 'https://www.plantuml.com/plantuml',
    header: '',
    debounce: 3,
    localJar: '',
    javaPath: 'java',
    defaultProcessor: "png",
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

        if(Platform.isDesktopApp) {
            new Setting(containerEl)
                .setName("Local JAR")
                .setDesc("Path to local PlantUML Jar")
                .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.localJar)
                    .setValue(this.plugin.settings.localJar)
                    .onChange(async (value) => {
                            this.plugin.settings.localJar = value;
                            await this.plugin.saveSettings();
                        }
                    )
                );

            new Setting(containerEl)
                .setName("Java Path")
                .setDesc("Path to Java executable")
                .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.javaPath)
                    .setValue(this.plugin.settings.javaPath)
                    .onChange(async (value) => {
                            this.plugin.settings.javaPath = value;
                            await this.plugin.saveSettings();
                        }
                    )
                );
        }

        new Setting(containerEl)
            .setName("Default processor for includes")
            .setDesc("Any .pu/.puml files linked will use this processor")
            .addDropdown(dropdown => {
               dropdown
                   .addOption("png", "PNG")
                   .addOption("svg", "SVG")
                   .setValue(this.plugin.settings.defaultProcessor)
                   .onChange(async(value) => {
                      this.plugin.settings.defaultProcessor = value;
                      await this.plugin.saveSettings();
                   });
            });

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
                    text.inputEl.addClass("puml-settings-area")
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
