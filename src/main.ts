import {
    addIcon, Component, EventRef, Events, Notice, Platform,
    Plugin, TFile
} from 'obsidian';
import {DEFAULT_SETTINGS, PlantUMLSettings, PlantUMLSettingsTab} from "./settings";
import {LocalProcessors} from "./processors/localProcessors";
import {DebouncedProcessors} from "./processors/debouncedProcessors";
import {LOGO_SVG} from "./const";
import {Processor} from "./processors/processor";
import {ServerProcessor} from "./processors/serverProcessor";
import {Replacer} from "./functions";
import {PumlView, VIEW_TYPE} from "./PumlView";
import localforage from "localforage";
import {PumlEmbed} from "./embed";

declare module "obsidian" {
    interface Workspace {
        on(
            name: "hover-link",
            callback: (e: MouseEvent) => unknown,
            ctx?: unknown,
        ): EventRef;
    }
    interface App {
        embedRegistry: EmbedRegistry;
    }
    interface EmbedRegistry extends Events {
        registerExtensions(extensions: string[], embedCreator: EmbedCreator): void;
        unregisterExtensions(extensions: string[]): void;
    }
    interface EmbedChild extends Component {
        loadFile(): Promise<void>;
    }
    type EmbedCreator = (context: EmbedContext, file: TFile, path?: string) => Component;
    interface EmbedContext {
        app: App;
        containerEl: HTMLElement;
    }
}

export default class PlantumlPlugin extends Plugin {
    settings: PlantUMLSettings;

    serverProcessor: Processor;
    localProcessor: Processor;
    replacer: Replacer;

    observer: MutationObserver;

    public hover: {
        linkText: string;
        sourcePath: string;
    } = {
        linkText: null,
        sourcePath: null,
    };

    getProcessor(): Processor {
        if (Platform.isMobileApp) {
            return this.serverProcessor;
        }
        if (this.settings.localJar.length > 0) {
            return this.localProcessor;
        }
        return this.serverProcessor;
    }

    onload(): void {
        void this.loadSettings().then(async () => {
            this.addSettingTab(new PlantUMLSettingsTab(this));
            this.replacer = new Replacer(this);

            this.serverProcessor = new ServerProcessor(this);
            if (Platform.isDesktopApp) {
                this.localProcessor = new LocalProcessors(this);
            }

            const processor = new DebouncedProcessors(this);

            addIcon("document-" + VIEW_TYPE, LOGO_SVG);
            this.registerView(VIEW_TYPE, (leaf) => {
                return new PumlView(leaf, this);
            });
            this.registerExtensions(["puml", "pu"], VIEW_TYPE);

            this.registerMarkdownCodeBlockProcessor("plantuml", processor.default);
            this.registerMarkdownCodeBlockProcessor("plantuml-png", processor.png);
            this.registerMarkdownCodeBlockProcessor("plantuml-ascii", processor.ascii);
            this.registerMarkdownCodeBlockProcessor("plantuml-svg", processor.svg);
            this.registerMarkdownCodeBlockProcessor("puml", processor.default);
            this.registerMarkdownCodeBlockProcessor("puml-png", processor.png);
            this.registerMarkdownCodeBlockProcessor("puml-svg", processor.svg);
            this.registerMarkdownCodeBlockProcessor("puml-ascii", processor.ascii);

            //keep this processor for backwards compatibility
            this.registerMarkdownCodeBlockProcessor("plantuml-map", processor.png);

            this.app.embedRegistry.registerExtensions(['puml', 'pu'], (ctx, file, _subpath) => new PumlEmbed(this, file, ctx));

            this.addCommand({
                id: 'clear-cache',
                name: 'Clear diagram cache',
                callback: async () => {
                    await this.clearCache();
                }
            });

            this.cleanupLocalStorage();
            localforage.config({
                name: 'puml',
                description: 'PlantUML plugin'
            });
            await this.cleanupCache();

            //internal links
            this.observer = new MutationObserver((mutations) => {
                void this._handleHoverMutation(mutations);
            });

            this.registerEvent(this.app.workspace.on("hover-link", (event: unknown) => {
                const hoverEvent = event as { linktext: string; sourcePath: string };
                const linkText = hoverEvent.linktext;
                if (!linkText) return;
                const sourcePath = hoverEvent.sourcePath;

                if (!linkText.endsWith(".puml") && !linkText.endsWith(".pu")) {
                    return;
                }

                this.hover.linkText = linkText;
                this.hover.sourcePath = sourcePath;
            }));

            this.observer.observe(activeDocument, {childList: true, subtree: true});
        });
    }

    private async _handleHoverMutation(mutations: MutationRecord[]): Promise<void> {
        if (mutations.length !== 1) return;
        if (mutations[0].addedNodes.length !== 1) return;
        if (this.hover.linkText === null) return;
        //@ts-ignore
        if (mutations[0].addedNodes[0].className !== "popover hover-popover file-embed is-loaded") return;

        const file = this.app.metadataCache.getFirstLinkpathDest(this.hover.linkText, this.hover.sourcePath);
        if (!file) return;
        if (file.extension !== "puml" && file.extension !== "pu") return;

        const fileContent = await this.app.vault.read(file);
        const imgDiv = createDiv();
        if(this.settings.defaultProcessor === "png") {
            await this.getProcessor().png(fileContent, imgDiv, null);
        }else {
            await this.getProcessor().svg(fileContent, imgDiv, null);
        }

        const node: Node = mutations[0].addedNodes[0];
        node.empty();

        const div = createDiv("", (element) => {
            element.appendChild(imgDiv);
            element.setAttribute('src', file.path);
            element.onClickEvent((event => {
                event.stopImmediatePropagation();
                const leaf = this.app.workspace.getLeaf(event.ctrlKey);
                void leaf.setViewState({
                    type: VIEW_TYPE,
                    state: {file: file.path}
                });
            }));
        });
        node.appendChild(div);
    }

    async cleanupCache() {
        await localforage.iterate((value, key) => {
            if(key.startsWith('ts-')) {
                const encoded = key.split('-')[1];
                if(value < new Date().getTime() - (this.settings.cache * 24 * 60 * 60 * 1000)) {
                    void localforage.removeItem('png-' + encoded);
                    void localforage.removeItem('svg-' + encoded);
                    void localforage.removeItem('map-' + encoded);
                    void localforage.removeItem('ascii-' + encoded);
                }
            }
        });
    }

    async clearCache() {
        await localforage.clear();
        new Notice("Cache cleared");
    }

    /*
     * older versions used to store generated images in local storage when using local generation.
     * To fix issues with the local storage quota we have to clean this up when upgrading from a version that supported this.
     */
    cleanupLocalStorage() {
        for (const key of Object.keys(window.localStorage)) {
            if(key.endsWith('-map') || key.endsWith('-png') || key.endsWith('-svg') || key.endsWith('ascii')) {
                window.localStorage.removeItem(key);
            }
        }
    }

    onunload(): void {
        this.observer.disconnect();
        this.app.embedRegistry.unregisterExtensions(['puml', 'pu']);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PlantUMLSettings>);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    async onExternalSettingsChange() {
        await this.loadSettings();
    }
}
