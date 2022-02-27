import PlantumlPlugin from "./main";
import {Processor} from "./processor";
import {MarkdownPostProcessorContext} from "obsidian";
import * as plantuml from "plantuml-encoder";
import {insertAsciiImage, insertImageWithMap, insertSvgImage} from "./functions";
import {OutputType} from "./const";

export class LocalProcessors implements Processor {

    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    ascii = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        const image = await this.generateLocalImage(source, OutputType.ASCII, this.plugin.replacer.getPath(ctx));
        insertAsciiImage(el, image);
    }

    png = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        const encodedDiagram = plantuml.encode(source);
        const path = this.plugin.replacer.getPath(ctx);
        const image = await this.generateLocalImage(source, OutputType.PNG, path);
        const map = await this.generateLocalMap(source, path);
        insertImageWithMap(el, image, map, encodedDiagram);
    }

    svg = async(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        const image = await this.generateLocalImage(source, OutputType.SVG, this.plugin.replacer.getPath(ctx));
        insertSvgImage(el, image);
    }

    async generateLocalMap(source: string, path: string): Promise<string> {
        const resolve = require('path').resolve;
        const {exec} = require('child_process');
        const jar = resolve(__dirname, this.plugin.settings.localJar);
        const args = [
            '-jar',
            '-Djava.awt.headless=true',
            jar,
            '-charset utf-8',
            '-pipemap'
        ];
        const child = exec('java ' + args.join(" "), {encoding: 'binary', cwd: path});

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
        const resolve = require('path').resolve;
        const {ChildProcess, exec} = require('child_process');

        const jar = resolve(__dirname, this.plugin.settings.localJar);
        const args = [
            '-jar',
            '-Djava.awt.headless=true',
            jar,
            '-t' + type,
            '-charset utf-8',
            '-pipe'
        ];

        let child: typeof ChildProcess;
        if (type === OutputType.PNG) {
            child = exec('java ' + args.join(" "), {encoding: 'binary', cwd: path});
        } else {
            child = exec('java ' + args.join(" "), {encoding: 'utf-8', cwd: path});
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
                if (code === 0) {
                    if (type === OutputType.PNG) {
                        const buf = new Buffer(stdout, 'binary');
                        resolve(buf.toString('base64'));
                        return;
                    }
                    resolve(stdout);
                    return;
                } else if (code === 1) {
                    console.log(stdout);
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
}
