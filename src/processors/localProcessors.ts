import PlantumlPlugin from "../main";
import {Processor} from "./processor";
import {MarkdownPostProcessorContext, Platform} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../functions";
import {OutputType} from "../const";
import * as localforage from "localforage";

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

        const encodedDiagram = plantuml.encode(source);
        const item: string = await localforage.getItem('ascii-' + encodedDiagram);
        if(item) {
            insertAsciiImage(el, item);
            await localforage.setItem('ts-' + encodedDiagram, Date.now());
            return;
        }

        const image = await this.generateLocalImage(source, OutputType.ASCII, this.plugin.replacer.getPath(ctx));
        insertAsciiImage(el, image);
        await localforage.setItem('ascii-' + encodedDiagram, image);
        await localforage.setItem('ts-' + encodedDiagram, Date.now());
    }

    png = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        await loadNodeModules();

        const encodedDiagram = plantuml.encode(source);
        const item: string = await localforage.getItem('png-' + encodedDiagram);
        if(item) {
            const map: string = await localforage.getItem('map-' + encodedDiagram);
            insertImageWithMap(el, item , map, encodedDiagram);
            await localforage.setItem('ts-' + encodedDiagram, Date.now());
            return;
        }

        const path = this.plugin.replacer.getPath(ctx);
        const image = await this.generateLocalImage(source, OutputType.PNG, path);
        const map = await this.generateLocalMap(source, path);

        await localforage.setItem('png-' + encodedDiagram, image);
        await localforage.setItem('map-' + encodedDiagram, map);
        await localforage.setItem('ts-'+ encodedDiagram, Date.now());

        insertImageWithMap(el, image, map, encodedDiagram);
    }

    svg = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        if (!Platform.isDesktop) {
            throw new Error('Local processing is only available on desktop');
        }

        await loadNodeModules();

        const encodedDiagram = plantuml.encode(source);
        const item: string = await localforage.getItem('svg-' + encodedDiagram);
        if(item) {
            insertSvgImage(el, item);
            await localforage.setItem('ts-' + encodedDiagram, Date.now());
            return;
        }
        const image = await this.generateLocalImage(source, OutputType.SVG, this.plugin.replacer.getPath(ctx));
        await localforage.setItem('svg-' + encodedDiagram, image);
        await localforage.setItem('ts-' + encodedDiagram, Date.now());
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

        if(jarFullPath.endsWith('.jar')) {
            return [
                this.plugin.settings.javaPath, '-jar', '-Djava.awt.headless=true', '"' + jarFullPath + '"', '-charset', 'utf-8', '-graphvizdot', '"' + this.plugin.settings.dotPath + '"'
            ];
        }
        return [
            jarFullPath, '-Djava.awt.headless=true', '-charset', 'utf-8', '-graphvizdot', '"' + this.plugin.settings.dotPath + '"'
        ];
    }
}
