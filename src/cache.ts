import * as localforage from 'localforage';
import * as plantuml from 'plantuml-encoder';
import { Notice } from 'obsidian';

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

    async get(encoded: string): Promise<DiagramCacheEntry | null> {
        return localforage.getItem(DIAGRAM_PREFIX + encoded);
    }

    async set(encoded: string, entry: DiagramCacheEntry): Promise<void> {
        await localforage.setItem(DIAGRAM_PREFIX + encoded, entry);
        for (const filename of (entry.includes ?? [])) {
            const indexKey = INCLUDES_PREFIX + filename;
            const existing: string[] | null = await localforage.getItem(indexKey);
            await localforage.setItem(indexKey, [...new Set([...(existing ?? []), encoded])]);
        }
    }

    async evictForFile(filename: string): Promise<void> {
        const indexKey = INCLUDES_PREFIX + filename;
        const encodedList: string[] | null = await localforage.getItem(indexKey);
        if (!encodedList?.length) return;
        for (const encoded of encodedList) {
            await localforage.removeItem(DIAGRAM_PREFIX + encoded);
        }
        await localforage.removeItem(indexKey);
    }

    async clear(notify = false): Promise<void> {
        await localforage.clear();
        if (notify) new Notice('PlantUML diagram cache cleared.');
    }

    async evictExpired(ttlDays: number): Promise<void> {
        const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const expired: Array<{ encoded: string; entry: DiagramCacheEntry }> = [];

        await localforage.iterate((value: DiagramCacheEntry, key) => {
            if (key.startsWith(DIAGRAM_PREFIX) && value.ts < now - ttlMs) {
                expired.push({ encoded: key.slice(DIAGRAM_PREFIX.length), entry: value });
            }
        });

        for (const { encoded, entry } of expired) {
            await localforage.removeItem(DIAGRAM_PREFIX + encoded);
            for (const filename of (entry.includes ?? [])) {
                const indexKey = INCLUDES_PREFIX + filename;
                const index: string[] | null = await localforage.getItem(indexKey);
                if (index) {
                    const updated = index.filter(e => e !== encoded);
                    if (updated.length === 0) {
                        await localforage.removeItem(indexKey);
                    } else {
                        await localforage.setItem(indexKey, updated);
                    }
                }
            }
        }
    }

    async migrateFromV1(): Promise<void> {
        const oldKeys: string[] = [];
        await localforage.iterate((_value, key) => {
            if (key.startsWith('ts-')) oldKeys.push(key.slice(3));
        });

        for (const encoded of oldKeys) {
            try {
                const png: string | null = await localforage.getItem('png-' + encoded);
                const svg: string | null = await localforage.getItem('svg-' + encoded);
                const ascii: string | null = await localforage.getItem('ascii-' + encoded);
                const map: string | null = await localforage.getItem('map-' + encoded);
                const ts: number | null = await localforage.getItem('ts-' + encoded);

                const includes = parseIncludedFiles(plantuml.decode(encoded));
                const entry: DiagramCacheEntry = {
                    ts: ts ?? Date.now(),
                    includes,
                    ...(png != null && { png }),
                    ...(svg != null && { svg }),
                    ...(ascii != null && { ascii }),
                    ...(map != null && { map }),
                };
                await localforage.setItem(DIAGRAM_PREFIX + encoded, entry);

                for (const filename of includes) {
                    const indexKey = INCLUDES_PREFIX + filename;
                    const existing: string[] | null = await localforage.getItem(indexKey);
                    await localforage.setItem(indexKey, [...new Set([...(existing ?? []), encoded])]);
                }
            } catch {
                // decode failed — entry will rebuild on next render
            }

            await localforage.removeItem('ts-' + encoded);
            await localforage.removeItem('png-' + encoded);
            await localforage.removeItem('svg-' + encoded);
            await localforage.removeItem('ascii-' + encoded);
            await localforage.removeItem('map-' + encoded);
        }

        if (oldKeys.length > 0) {
            console.debug(`PlantUML: migrated ${oldKeys.length} cache entries to new format`);
        }
    }
}
