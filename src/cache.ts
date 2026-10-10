import * as plantuml from 'plantuml-encoder';
import { Notice } from 'obsidian';
import { IdbStore } from './idbStore';

export interface DiagramCacheEntry {
    ts: number;
    png?: string;
    svg?: string;
    ascii?: string;
    map?: string;
    includes?: string[];
}

const DIAGRAM_PREFIX = 'diagram-';
const INCLUDES_PREFIX = 'includes-';

export function parseIncludedFiles(source: string): string[] {
    const pattern = /^[ \t]*!include(?:_once|_many)?[ \t]+([^\s!]+)/gm;
    const files = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
        const raw = match[1];
        if (raw.startsWith('http://') || raw.startsWith('https://')) continue;
        files.add(raw.split('/').pop() ?? raw);
    }
    return Array.from(files);
}

export class DiagramCache {

    private store = new IdbStore('puml');

    // the cache only saves rendering time, if IndexedDB is unavailable diagrams still have to render
    async get(encoded: string): Promise<DiagramCacheEntry | null> {
        try {
            return await this.store.getItem<DiagramCacheEntry>(DIAGRAM_PREFIX + encoded);
        } catch (error) {
            console.warn('PlantUML: diagram cache unavailable', error);
            return null;
        }
    }

    async set(encoded: string, entry: DiagramCacheEntry): Promise<void> {
        try {
            await this.store.setItem(DIAGRAM_PREFIX + encoded, entry);
            for (const filename of (entry.includes ?? [])) {
                const indexKey = INCLUDES_PREFIX + filename;
                const existing: string[] | null = await this.store.getItem(indexKey);
                await this.store.setItem(indexKey, [...new Set([...(existing ?? []), encoded])]);
            }
        } catch (error) {
            console.warn('PlantUML: diagram cache unavailable', error);
        }
    }

    async evictForFile(filename: string): Promise<void> {
        const indexKey = INCLUDES_PREFIX + filename;
        const encodedList: string[] | null = await this.store.getItem(indexKey);
        if (!encodedList?.length) return;
        for (const encoded of encodedList) {
            await this.store.removeItem(DIAGRAM_PREFIX + encoded);
        }
        await this.store.removeItem(indexKey);
    }

    async clear(notify = false): Promise<void> {
        await this.store.clear();
        if (notify) new Notice('PlantUML diagram cache cleared.');
    }

    async evictExpired(ttlDays: number): Promise<void> {
        const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const expired: Array<{ encoded: string; entry: DiagramCacheEntry }> = [];

        await this.store.iterate((value: DiagramCacheEntry, key) => {
            if (key.startsWith(DIAGRAM_PREFIX) && value.ts < now - ttlMs) {
                expired.push({ encoded: key.slice(DIAGRAM_PREFIX.length), entry: value });
            }
        });

        for (const { encoded, entry } of expired) {
            await this.store.removeItem(DIAGRAM_PREFIX + encoded);
            for (const filename of (entry.includes ?? [])) {
                const indexKey = INCLUDES_PREFIX + filename;
                const index: string[] | null = await this.store.getItem(indexKey);
                if (index) {
                    const updated = index.filter(e => e !== encoded);
                    if (updated.length === 0) {
                        await this.store.removeItem(indexKey);
                    } else {
                        await this.store.setItem(indexKey, updated);
                    }
                }
            }
        }
    }

    async migrateFromV1(): Promise<void> {
        const oldKeys: string[] = [];
        await this.store.iterate((_value, key) => {
            if (key.startsWith('ts-')) oldKeys.push(key.slice(3));
        });

        for (const encoded of oldKeys) {
            try {
                const png: string | null = await this.store.getItem('png-' + encoded);
                const svg: string | null = await this.store.getItem('svg-' + encoded);
                const ascii: string | null = await this.store.getItem('ascii-' + encoded);
                const map: string | null = await this.store.getItem('map-' + encoded);
                const ts: number | null = await this.store.getItem('ts-' + encoded);

                const includes = parseIncludedFiles(plantuml.decode(encoded));
                const entry: DiagramCacheEntry = {
                    ts: ts ?? Date.now(),
                    includes,
                    ...(png != null && { png }),
                    ...(svg != null && { svg }),
                    ...(ascii != null && { ascii }),
                    ...(map != null && { map }),
                };
                await this.store.setItem(DIAGRAM_PREFIX + encoded, entry);

                for (const filename of includes) {
                    const indexKey = INCLUDES_PREFIX + filename;
                    const existing: string[] | null = await this.store.getItem(indexKey);
                    await this.store.setItem(indexKey, [...new Set([...(existing ?? []), encoded])]);
                }
            } catch {
                // decode failed — entry will rebuild on next render
            }

            await this.store.removeItem('ts-' + encoded);
            await this.store.removeItem('png-' + encoded);
            await this.store.removeItem('svg-' + encoded);
            await this.store.removeItem('ascii-' + encoded);
            await this.store.removeItem('map-' + encoded);
        }

        if (oldKeys.length > 0) {
            console.debug(`PlantUML: migrated ${oldKeys.length} cache entries to new format`);
        }
    }
}
