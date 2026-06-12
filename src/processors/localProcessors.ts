import PlantumlPlugin from "../main";
import {Processor} from "./processor";
import {MarkdownPostProcessorContext, Platform} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../functions";
import {OutputType} from "../const";
import {DiagramCacheEntry, parseIncludedFiles} from "../cache";

let exec: typeof import('child_process').exec;
let Buffer: typeof import('buffer').Buffer;
let pathModule: typeof import('path');
let osModule: typeof import('os');

async function loadNodeModules() {
    if (Platform.isDesktop && !exec) {
        // Obsidian shadows `require` with its own resolver; window.require is Electron's Node.js require
        const nodeRequire = (window as Window & {require: (id: string) => unknown}).require;
        exec = (nodeRequire('child_process') as typeof import('child_process')).exec;
        Buffer = (nodeRequire('buffer') as typeof import('buffer')).Buffer;
        pathModule = nodeRequire('path') as typeof import('path');
        osModule = nodeRequire('os') as typeof import('os');
    }
}

export class LocalProcessors implements Processor {

    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    ascii = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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

        const image = await this.generateLocalImage(source, OutputType.ASCII, this.plugin.replacer.getPath(ctx));
        const includes = parseIncludedFiles(source);
        const entry: DiagramCacheEntry = { ts: Date.now(), ascii: image, includes, ...cached && { png: cached.png, svg: cached.svg, map: cached.map } };
        await this.plugin.cache.set(encoded, entry);
        insertAsciiImage(el, image);
    }

    png = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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
        const [image, map] = await Promise.all([
            this.generateLocalImage(source, OutputType.PNG, path),
            this.generateLocalMap(source, path),
        ]);
        const includes = parseIncludedFiles(source);
        const entry: DiagramCacheEntry = { ts: Date.now(), png: image, map, includes, ...cached && { svg: cached.svg, ascii: cached.ascii } };
        await this.plugin.cache.set(encoded, entry);
        insertImageWithMap(el, image, map, encoded);
    }

    svg = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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

        const image = await this.generateLocalImage(source, OutputType.SVG, this.plugin.replacer.getPath(ctx));
        const includes = parseIncludedFiles(source);
        const entry: DiagramCacheEntry = { ts: Date.now(), svg: image, includes, ...cached && { png: cached.png, map: cached.map, ascii: cached.ascii } };
        await this.plugin.cache.set(encoded, entry);
        insertSvgImage(el, image);
    }

    async generateLocalMap(source: string, path: string): Promise<string> {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        const args = await this.resolveLocalJarCmd();
        const child = exec(args.concat(['-pipemap']).join(" "), {encoding: 'binary', cwd: path});

        let stdout = "";

        if (child.stdout) {
            child.stdout.on("data", (data: string) => {
                stdout += data;
            });
        }

        return new Promise((resolve, reject) => {
            child.on("error", reject);

            child.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout);
                    return;
                } else if (code === 1) {
                    console.error(stdout);
                    reject(new Error(`an error occurred`));
                } else {
                    reject(new Error(`child exited with code ${String(code)}`));
                }
            });

            child.stdin?.write(source);
            child.stdin?.end();
        });
    }

    async generateLocalImage(source: string, type: OutputType, path: string): Promise<string> {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        const args = await this.resolveLocalJarCmd();
        const cmdArgs = args.concat(['-t' + type, '-pipe']);

        const child = exec(cmdArgs.join(" "), {
            encoding: type === OutputType.PNG ? 'binary' : 'utf-8',
            cwd: path
        });

        let stdout: string | null = null;
        let stderr: string | null = null;

        if (child.stdout) {
            child.stdout.on("data", (data: string) => {
                stdout = stdout === null ? data : stdout + data;
            });
        }

        if (child.stderr) {
            child.stderr.on('data', (data: string) => {
                stderr = stderr === null ? data : stderr + data;
            });
        }

        return new Promise((resolve, reject) => {
            child.on("error", reject);

            child.on("close", (code) => {
                if (stdout === null) {
                    return;
                }
                if (code === 0) {
                    if (type === OutputType.PNG) {
                        resolve(Buffer.from(stdout, 'binary').toString('base64'));
                        return;
                    }
                    resolve(stdout);
                    return;
                } else if (code === 1) {
                    console.error(stdout);
                    reject(new Error(stderr ?? ''));
                } else {
                    if (type === OutputType.PNG) {
                        resolve(Buffer.from(stdout, 'binary').toString('base64'));
                        return;
                    }
                    resolve(stdout);
                }
            });
            child.stdin?.write(source, "utf-8");
            child.stdin?.end();
        });
    }

    /**
     * To support local jar settings with unix-like style, and search local jar file
     * from current vault path.
     */
    private async resolveLocalJarCmd(): Promise<string[]> {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        const jarFromSettings = this.plugin.settings.localJar;
        let jarFullPath: string;
        const path = this.plugin.replacer.getFullPath("");

        if (jarFromSettings[0] === '~') {
            // As a workaround, I'm not sure what would isAbsolute() return with unix-like path
            jarFullPath = osModule.userInfo().homedir + jarFromSettings.slice(1);
        }
        else {
            if (pathModule.isAbsolute(jarFromSettings)) {
                jarFullPath = jarFromSettings;
            }
            else {
                // the default search path is current vault
                jarFullPath = pathModule.resolve(path, jarFromSettings);
            }
        }

        if (jarFullPath.length == 0) {
            throw Error('Invalid local jar file');
        }

        let javaPath = this.plugin.settings.javaPath;
        if (javaPath[0] === '~') {
            javaPath = osModule.userInfo().homedir + javaPath.slice(1);
        }

        let dotPath = this.plugin.settings.dotPath;
        if (dotPath[0] === '~') {
            dotPath = osModule.userInfo().homedir + dotPath.slice(1);
        }
        const graphvizArgs = dotPath
            ? ['-graphvizdot', '"' + dotPath + '"']
            : [];

        if(jarFullPath.endsWith('.jar')) {
            return [
                javaPath, '-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-jar', '"' + jarFullPath + '"', '-charset', 'utf-8', ...graphvizArgs
            ];
        }
        return [
            jarFullPath, '-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-charset', 'utf-8', ...graphvizArgs
        ];
    }
}
