import {Notice, Platform, PluginSettingTab, Setting} from "obsidian";
import PlantumlPlugin from "./main";

export interface PlantUMLSettings {
    server_url: string,
    header: string;
    debounce: number;
    localJar: string;
    javaPath: string;
    dotPath: string;
    defaultProcessor: string;
    cache: number;
}

export const DEFAULT_SETTINGS: PlantUMLSettings = {
    server_url: 'https://www.plantuml.com/plantuml',
    header: '',
    debounce: 3,
    localJar: '',
    javaPath: 'java',
    dotPath: 'dot',
    defaultProcessor: "png",
    cache: 60,
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

            const jarDesc = new DocumentFragment();
            jarDesc.createDiv().innerHTML = "Path to local JAR<br>Supports:" +
                "<ul>" +
                "<li>Absolute path</li>" +
                "<li>Path relative to vault</li>" +
                "<li>Path relative to users home directory <code>~/</code></li>" +
                "</ul>";

            new Setting(containerEl)
                .setName("Local JAR")
                .setDesc(jarDesc)
                .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.localJar)
                    .setValue(this.plugin.settings.localJar)
                    .onChange(async (value) => {
                            this.plugin.settings.localJar = value;
                            await this.plugin.saveSettings();
                        }
                    )
                );

            new Setting(containerEl)
                .setName("Java path")
                .setDesc("Path to Java executable")
                .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.javaPath)
                    .setValue(this.plugin.settings.javaPath)
                    .onChange(async (value) => {
                            this.plugin.settings.javaPath = value;
                            await this.plugin.saveSettings();
                        }
                    )
                );

            new Setting(containerEl)
                .setName("Dot path")
                .setDesc("Path to dot executable")
                .addText(text => text.setPlaceholder(DEFAULT_SETTINGS.dotPath)
                    .setValue(this.plugin.settings.dotPath)
                    .onChange(async (value) => {
                            this.plugin.settings.dotPath = value;
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

        new Setting(containerEl)
            .setName('Cache')
            .setDesc('in days. Only applicable when generating diagrams locally')
            .addSlider(slider => {
                slider
                    .setLimits(10, 360, 10)
                    .setValue(this.plugin.settings.cache)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        this.plugin.settings.cache = value;
                        await this.plugin.saveSettings();
                    })
            });

        new Setting(containerEl)
            .setName("Debounce")
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
