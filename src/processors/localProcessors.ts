import PlantumlPlugin from "../main";
import {Processor} from "./processor";
import {MarkdownPostProcessorContext, moment} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "../functions";
import {OutputType} from "../const";
import * as localforage from "localforage";

export class LocalProcessors implements Processor {

    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    ascii = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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
        const {exec} = require('child_process');
        const args = this.resolveLocalJarCmd().concat(['-pipemap']);
        const child = exec(args.join(" "), {encoding: 'binary', cwd: path});

        let stdout = "";

        if (child.stdout) {
            child.stdout.on("data", (data: any) => {
                stdout += data;
            });
        }

        return new Promise((resolve, reject) => {
            child.on("error", reject);

            child.on("close", (code: any) => {
                if (code === 0) {
                    resolve(stdout);
                    return;
                } else if (code === 1) {
                    console.log(stdout);
                    reject(new Error(`an error occurred`));
                } else {
                    reject(new Error(`child exited with code ${code}`));
                }
            });

            child.stdin.write(source);
            child.stdin.end();
        });
    }

    async generateLocalImage(source: string, type: OutputType, path: string): Promise<string> {
        const {ChildProcess, exec} = require('child_process');
        const args = this.resolveLocalJarCmd().concat(['-t' + type, '-pipe']);

        let child: typeof ChildProcess;
        if (type === OutputType.PNG) {
            child = exec(args.join(" "), {encoding: 'binary', cwd: path});
        } else {
            child = exec(args.join(" "), {encoding: 'utf-8', cwd: path});
        }

        let stdout: any;
        let stderr: any;

        if (child.stdout) {
            child.stdout.on("data", (data: any) => {
                if (stdout === undefined) {
                    stdout = data;
                } else stdout += data;
            });
        }

        if (child.stderr) {
            child.stderr.on('data', (data: any) => {
                if (stderr === undefined) {
                    stderr = data;
                } else stderr += data;
            });
        }

        return new Promise((resolve, reject) => {
            child.on("error", reject);

            child.on("close", (code: any) => {
                if(stdout === undefined) {
                    return;
                }
                if (code === 0) {
                    if (type === OutputType.PNG) {
                        const buf = new Buffer(stdout, 'binary');
                        resolve(buf.toString('base64'));
                        return;
                    }
                    resolve(stdout);
                    return;
                } else if (code === 1) {
                    console.error(stdout);
                    reject(new Error(stderr));
                } else {
                    if (type === OutputType.PNG) {
                        const buf = new Buffer(stdout, 'binary');
                        resolve(buf.toString('base64'));
                        return;
                    }
                    resolve(stdout);
                    return;
                }
            });
            child.stdin.write(source, "utf-8");
            child.stdin.end();
        });
    }

    /**
     * To support local jar settings with unix-like style, and search local jar file
     * from current vault path.
     */
    private resolveLocalJarCmd(): string[] {
        const jarFromSettings = this.plugin.settings.localJar;
        const {isAbsolute, resolve} = require('path');
        const {userInfo} = require('os');
        let jarFullPath: string;
        const path = this.plugin.replacer.getFullPath("");

        if (jarFromSettings[0] === '~') {
            // As a workaround, I'm not sure what would isAbsolute() return with unix-like path
            jarFullPath = userInfo().homedir + jarFromSettings.slice(1);
        }
        else {
            if (isAbsolute(jarFromSettings)) {
                jarFullPath = jarFromSettings;
            }
            else {
                // the default search path is current vault
                jarFullPath = resolve(path, jarFromSettings);
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
