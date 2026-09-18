import {vi} from "vitest";
import {FileSystemAdapter, TFile} from "obsidian";
import type PlantumlPlugin from "../src/main";
import {DEFAULT_SETTINGS, PlantUMLSettings} from "../src/settings";
import {Replacer} from "../src/functions";
import type {Processor} from "../src/processors/processor";
import type {DiagramCacheEntry} from "../src/cache";

/** an in-memory replacement for the localforage backed DiagramCache */
export class MemoryCache {
    entries = new Map<string, DiagramCacheEntry>();

    get = vi.fn(async (encoded: string) => this.entries.get(encoded) ?? null);
    set = vi.fn(async (encoded: string, entry: DiagramCacheEntry) => {
        this.entries.set(encoded, entry);
    });
    clear = vi.fn(async () => {
        this.entries.clear();
    });
    evictForFile = vi.fn(async () => undefined);
    evictExpired = vi.fn(async () => undefined);
    migrateFromV1 = vi.fn(async () => undefined);
}

export interface FakePluginOptions {
    settings?: Partial<PlantUMLSettings>;
    /** vault paths of the files that exist, e.g. `["Notes/Target.md"]` */
    files?: string[];
    vaultName?: string;
    /** absolute path of the vault on disk */
    basePath?: string;
}

export type FakePlugin = PlantumlPlugin & {cache: MemoryCache};

function resolveLink(files: TFile[], linkpath: string): TFile | null {
    const path = linkpath.split("#")[0];
    return files.find(file =>
        file.path === path
        || file.path === path + ".md"
        || file.basename === path
        || file.name === path
    ) ?? null;
}

/**
 * builds a PlantumlPlugin-shaped object without running `onload`,
 * with just enough of `app` for the processors and the Replacer.
 */
export function createPlugin(options: FakePluginOptions = {}): FakePlugin {
    const files = (options.files ?? []).map(path => new TFile(path));
    const adapter = new FileSystemAdapter(options.basePath ?? "/vault");

    const app = {
        vault: {
            adapter,
            getName: vi.fn(() => options.vaultName ?? "Test Vault"),
            getAbstractFileByPath: vi.fn((path: string) => files.find(file => file.path === path) ?? null),
            getDirectParent: vi.fn((file: TFile) => {
                const index = file.path.lastIndexOf("/");
                return {path: index === -1 ? "" : file.path.substring(0, index)};
            }),
            read: vi.fn(async () => ""),
            create: vi.fn(async () => undefined),
            modify: vi.fn(async () => undefined),
            createBinary: vi.fn(async () => undefined),
            modifyBinary: vi.fn(async () => undefined),
            createFolder: vi.fn(async () => undefined),
        },
        metadataCache: {
            getFirstLinkpathDest: vi.fn((linkpath: string, _sourcePath: string) => resolveLink(files, linkpath)),
        },
        workspace: {
            openLinkText: vi.fn(async () => undefined),
            trigger: vi.fn(),
            getLeaf: vi.fn(),
            getLeavesOfType: vi.fn(() => []),
            on: vi.fn(),
        },
        getObsidianUrl: vi.fn((file: TFile) =>
            "obsidian://open?vault=" + encodeURIComponent(options.vaultName ?? "Test Vault") + "&file=" + encodeURIComponent(file.path)),
    };

    const plugin = {
        app,
        settings: {...DEFAULT_SETTINGS, ...options.settings},
        cache: new MemoryCache(),
        serverProcessor: undefined as Processor | undefined,
        localProcessor: undefined as Processor | undefined,
        getProcessor(): Processor {
            return this.settings.localJar.length > 0 ? this.localProcessor : this.serverProcessor;
        },
    } as unknown as FakePlugin;
    plugin.replacer = new Replacer(plugin);
    return plugin;
}

/** switch the (fake) Obsidian theme */
export function setTheme(theme: "dark" | "light") {
    document.body.toggleClass("theme-dark", theme === "dark");
    document.body.toggleClass("theme-light", theme === "light");
}
