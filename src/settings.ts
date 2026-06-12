import { Platform, PluginSettingTab, SettingDefinitionItem } from "obsidian";
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
    exportPath: string;
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
    exportPath: ''
}

export class PlantUMLSettingsTab extends PluginSettingTab {
    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: 'Server URL',
                desc: 'PlantUML server URL',
                control: {
                    type: 'text',
                    key: 'server_url',
                    placeholder: DEFAULT_SETTINGS.server_url,
                    defaultValue: DEFAULT_SETTINGS.server_url,
                }
            },
            {
                type: 'group',
                heading: 'Local rendering',
                visible: () => Platform.isDesktopApp,
                items: [
                    {
                        name: 'Local JAR',
                        desc: 'Path to local JAR file. Supports absolute paths, paths relative to the vault, and paths relative to the home directory (~/).',
                        control: {
                            type: 'text',
                            key: 'localJar',
                        }
                    },
                    {
                        name: 'Java path',
                        desc: 'Path to Java executable.',
                        control: {
                            type: 'text',
                            key: 'javaPath',
                            placeholder: DEFAULT_SETTINGS.javaPath,
                            defaultValue: DEFAULT_SETTINGS.javaPath,
                        }
                    },
                    {
                        name: 'Dot path',
                        desc: 'Path to dot executable.',
                        control: {
                            type: 'text',
                            key: 'dotPath',
                            placeholder: DEFAULT_SETTINGS.dotPath,
                            defaultValue: DEFAULT_SETTINGS.dotPath,
                        }
                    },
                    {
                        name: 'Diagram export path',
                        desc: 'Path where exported diagrams will be saved relative to the vault root. Leave blank to save alongside the note.',
                        control: {
                            type: 'text',
                            key: 'exportPath',
                        }
                    },
                ]
            },
            {
                name: 'Default processor for includes',
                desc: 'Any .pu/.puml files linked will use this processor.',
                control: {
                    type: 'dropdown',
                    key: 'defaultProcessor',
                    defaultValue: DEFAULT_SETTINGS.defaultProcessor,
                    options: {
                        png: 'PNG',
                        svg: 'SVG',
                    }
                }
            },
            {
                name: 'Header',
                desc: 'Included at the head of every diagram. Useful for specifying a common theme.',
                control: {
                    type: 'textarea',
                    key: 'header',
                    placeholder: '!include https://raw.githubusercontent.com/....puml\n',
                    rows: 4,
                }
            },
            {
                name: 'Cache',
                desc: 'How long to cache locally generated diagrams, in days.',
                control: {
                    type: 'slider',
                    key: 'cache',
                    min: 10,
                    max: 360,
                    step: 10,
                    defaultValue: DEFAULT_SETTINGS.cache,
                }
            },
            {
                name: 'Debounce',
                desc: 'How often the diagram refreshes while editing, in seconds.',
                control: {
                    type: 'number',
                    key: 'debounce',
                    min: 1,
                    step: 1,
                    defaultValue: DEFAULT_SETTINGS.debounce,
                    validate: (value: number) => {
                        if (!Number.isFinite(value) || value < 1) return 'Must be a positive number.';
                    }
                }
            },
        ];
    }
}
