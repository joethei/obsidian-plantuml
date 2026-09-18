import PlantumlPlugin from "../main";
import {Processor, ProcessorContext} from "./processor";
import {Platform} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../functions";
import {OutputType} from "../const";
import {DiagramCacheEntry, parseIncludedFiles} from "../cache";

let execFile: typeof import('child_process').execFile;
let Buffer: typeof import('buffer').Buffer;
let pathModule: typeof import('path');
let osModule: typeof import('os');
let fsModule: typeof import('fs');

// execFile kills PlantUML once its output exceeds maxBuffer (1 MB by default), which large PNGs easily do
const MAX_BUFFER = 64 * 1024 * 1024;
// a java process that never exits would otherwise leave the diagram loading forever
const TIMEOUT_SECONDS = 60;

async function loadNodeModules() {
    if (Platform.isDesktop && !execFile) {
        // Obsidian shadows `require` with its own resolver; window.require is Electron's Node.js require
        const nodeRequire = (window as Window & {require: (id: string) => unknown}).require;
        execFile = (nodeRequire('child_process') as typeof import('child_process')).execFile;
        Buffer = (nodeRequire('buffer') as typeof import('buffer')).Buffer;
        pathModule = nodeRequire('path') as typeof import('path');
        osModule = nodeRequire('os') as typeof import('os');
        fsModule = nodeRequire('fs') as typeof import('fs');
    }
}

interface LocalImage {
    image: string;
    error: boolean;
}

export class LocalProcessors implements Processor {

    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    ascii = async(source: string, el: HTMLElement, ctx: ProcessorContext) => {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        await loadNodeModules();

        const encoded = plantuml.encode(source);
        const cached = await this.plugin.cache.get(encoded);

        if (cached?.ascii !== undefined) {
            insertAsciiImage(el, cached.ascii);
            await this.plugin.cache.set(encoded, { ...cached, ts: Date.now() });
            return;
        }

        const {image, error} = await this.generateLocalImage(source, OutputType.ASCII, this.plugin.replacer.getPath(ctx));
        if (!error) {
            const includes = parseIncludedFiles(source);
            const entry: DiagramCacheEntry = { ts: Date.now(), ascii: image, includes, ...cached && { png: cached.png, svg: cached.svg, map: cached.map } };
            await this.plugin.cache.set(encoded, entry);
        }
        insertAsciiImage(el, image);
    }

    png = async(source: string, el: HTMLElement, ctx: ProcessorContext) => {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        await loadNodeModules();

        const encoded = plantuml.encode(source);
        const cached = await this.plugin.cache.get(encoded);

        if (cached?.png !== undefined) {
            insertImageWithMap(el, cached.png, cached.map ?? '', encoded);
            await this.plugin.cache.set(encoded, { ...cached, ts: Date.now() });
            return;
        }

        const path = this.plugin.replacer.getPath(ctx);
        const [{image, error}, map] = await Promise.all([
            this.generateLocalImage(source, OutputType.PNG, path),
            this.generateLocalMap(source, path),
        ]);
        if (!error) {
            const includes = parseIncludedFiles(source);
            const entry: DiagramCacheEntry = { ts: Date.now(), png: image, map, includes, ...cached && { svg: cached.svg, ascii: cached.ascii } };
            await this.plugin.cache.set(encoded, entry);
        }
        insertImageWithMap(el, image, map, encoded);
    }

    svg = async(source: string, el: HTMLElement, ctx: ProcessorContext) => {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        await loadNodeModules();

        const encoded = plantuml.encode(source);
        const cached = await this.plugin.cache.get(encoded);

        if (cached?.svg !== undefined) {
            insertSvgImage(el, cached.svg);
            await this.plugin.cache.set(encoded, { ...cached, ts: Date.now() });
            return;
        }

        const {image, error} = await this.generateLocalImage(source, OutputType.SVG, this.plugin.replacer.getPath(ctx));
        if (!error) {
            const includes = parseIncludedFiles(source);
            const entry: DiagramCacheEntry = { ts: Date.now(), svg: image, includes, ...cached && { png: cached.png, map: cached.map, ascii: cached.ascii } };
            await this.plugin.cache.set(encoded, entry);
        }
        insertSvgImage(el, image);
    }

    async generateLocalMap(source: string, path: string): Promise<string> {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        const {cmd, args} = await this.resolveLocalJarCmd();
        const {stdout} = await this.run(cmd, args.concat(['-pipemap']), source, 'binary', path);
        return stdout;
    }

    async generateLocalImage(source: string, type: OutputType, path: string): Promise<LocalImage> {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        const {cmd, args} = await this.resolveLocalJarCmd();
        const encoding = type === OutputType.PNG ? 'binary' : 'utf-8';
        const {stdout, error} = await this.run(cmd, args.concat(['-t' + type, '-pipe']), source, encoding, path);

        const image = type === OutputType.PNG ? Buffer.from(stdout, 'binary').toString('base64') : stdout;
        return {image, error};
    }

    /**
     * pipe the source through PlantUML, the promise always settles once the process has exited or was stopped.
     * PlantUML renders syntax errors and Graphviz failures into the diagram, so any output is treated as a result,
     * `error` marks those so they don't get cached.
     */
    private run(cmd: string, args: string[], source: string, encoding: 'binary' | 'utf-8', cwd: string): Promise<{stdout: string, error: boolean}> {
        return new Promise((resolve, reject) => {
            let stdout = "";
            let stderr = "";
            let failed = false;

            const fail = (message: string) => {
                if (failed) return;
                failed = true;
                window.clearTimeout(timeout);
                reject(new Error(message));
            };

            const child = execFile(cmd, args, {encoding, cwd, maxBuffer: MAX_BUFFER});
            const timeout = window.setTimeout(() => {
                child.kill('SIGKILL');
                fail(`PlantUML did not finish within ${TIMEOUT_SECONDS} seconds and was stopped.`);
            }, TIMEOUT_SECONDS * 1000);

            child.stdout?.on("data", (data: string) => {
                stdout += data;
            });
            child.stderr?.on("data", (data: string) => {
                stderr += data;
            });

            child.on("error", (error: Error & {code?: string}) => {
                if (error.code === 'ENOENT') {
                    fail(`Could not start "${cmd}": ${error.message}\nCheck the "Java path" setting and that Java is installed.`);
                    return;
                }
                fail(`Could not start "${cmd}": ${error.message}`);
            });

            child.on("close", (code: number | null, signal: string | null) => {
                if (failed) return;
                window.clearTimeout(timeout);
                if (stderr.length > 0) {
                    console.warn("PlantUML:", stderr);
                }
                if (code === 0 || (code !== null && stdout.length > 0)) {
                    resolve({stdout, error: code !== 0 || /exception|error/i.test(stderr)});
                    return;
                }
                const reason = code === null ? `was terminated (${signal})` : `exited with code ${String(code)}`;
                fail(`PlantUML ${reason}` + (stderr.trim().length > 0 ? `:\n${stderr.trim()}` : ''));
            });

            // the process may be gone before it read the source, the close handler reports that
            child.stdin?.on("error", () => undefined);
            child.stdin?.write(source, "utf-8");
            child.stdin?.end();
        });
    }

    /**
     * To support local jar settings with unix-like style, and search local jar file
     * from current vault path.
     */
    private async resolveLocalJarCmd(): Promise<{cmd: string, args: string[]}> {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        await loadNodeModules();

        const jarFromSettings = this.expandPath(this.plugin.settings.localJar);
        if (jarFromSettings.length == 0) {
            throw Error('Invalid local jar file');
        }

        let jarFullPath: string;
        const path = this.plugin.replacer.getFullPath("");

        if (pathModule.isAbsolute(jarFromSettings)) {
            jarFullPath = jarFromSettings;
        }
        else {
            // the default search path is current vault
            jarFullPath = pathModule.resolve(path, jarFromSettings);
        }

        try {
            await fsModule.promises.access(jarFullPath);
        } catch {
            throw new Error(`PlantUML jar not found at "${jarFullPath}".\nCheck the "Local JAR" setting.`);
        }

        const javaPath = this.expandPath(this.plugin.settings.javaPath) || 'java';

        const dotPath = this.expandPath(this.plugin.settings.dotPath);
        const graphvizArgs = dotPath
            ? ['-graphvizdot', dotPath]
            : [];

        if(jarFullPath.toLowerCase().endsWith('.jar')) {
            return {
                cmd: javaPath,
                args: ['-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-jar', jarFullPath, '-charset', 'utf-8', ...graphvizArgs]
            };
        }
        return {
            cmd: jarFullPath,
            args: ['-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-charset', 'utf-8', ...graphvizArgs]
        };
    }

    /**
     * trim the path, remove the quotes Windows adds when using "Copy as path"
     * and expand ~ to the home directory
     */
    private expandPath(path: string): string {
        let expanded = path.trim();
        if (expanded.length >= 2 && expanded.startsWith('"') && expanded.endsWith('"')) {
            expanded = expanded.slice(1, -1).trim();
        }
        if (expanded[0] === '~') {
            expanded = osModule.userInfo().homedir + expanded.slice(1);
        }
        return expanded;
    }
}
