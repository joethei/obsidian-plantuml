/**
 * the object store localforage used, keeping it means caches written by earlier versions stay readable
 */
const STORE_NAME = "keyvaluepairs";

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error("IndexedDB request failed");
}

/**
 * a minimal promise based key-value store on top of IndexedDB,
 * covering the subset of the localforage API the diagram cache needs
 */
export class IdbStore {
    private connection: Promise<IDBDatabase> | null = null;

    constructor(private readonly name: string) {
    }

    async getItem<T>(key: string): Promise<T | null> {
        const value = await this.request<unknown>("readonly", store => store.get(key));
        return value === undefined ? null : value as T;
    }

    async setItem<T>(key: string, value: T): Promise<void> {
        await this.request("readwrite", store => store.put(value, key));
    }

    async removeItem(key: string): Promise<void> {
        await this.request("readwrite", store => store.delete(key));
    }

    async clear(): Promise<void> {
        await this.request("readwrite", store => store.clear());
    }

    async iterate<T>(callback: (value: T, key: string) => void): Promise<void> {
        const db = await this.open();
        const transaction = db.transaction(STORE_NAME, "readonly");
        const cursorRequest = transaction.objectStore(STORE_NAME).openCursor();
        let callbackError: unknown = null;
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            try {
                // localforage and this store only ever write string keys
                callback(cursor.value as T, cursor.key as string);
                cursor.continue();
            } catch (error) {
                callbackError = error;
                transaction.abort();
            }
        };
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(asError(callbackError ?? transaction.error));
        });
    }

    /**
     * run a single request and resolve once its transaction completed, so writes are committed
     */
    private async request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
        const db = await this.open();
        const transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        return new Promise<T>((resolve, reject) => {
            transaction.oncomplete = () => resolve(request.result as T);
            transaction.onabort = () => reject(asError(request.error ?? transaction.error));
        });
    }

    private open(): Promise<IDBDatabase> {
        if (this.connection === null) {
            this.connection = this.openDatabase().then(db => {
                if (db.objectStoreNames.contains(STORE_NAME)) return db;
                // the database exists without the store, it can only be added in a version upgrade
                const version = db.version + 1;
                db.close();
                return this.openDatabase(version);
            });
            // let the next call retry instead of keeping the failure
            this.connection.catch(() => {
                this.connection = null;
            });
        }
        return this.connection;
    }

    private openDatabase(version?: number): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, version);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                // the database is shared by all open vaults, don't block another one from upgrading it
                db.onversionchange = () => {
                    db.close();
                    this.connection = null;
                };
                db.onclose = () => {
                    this.connection = null;
                };
                resolve(db);
            };
            request.onerror = () => reject(asError(request.error));
        });
    }
}
