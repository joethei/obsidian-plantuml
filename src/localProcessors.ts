import PlantumlPlugin from "./main";

export class LocalProcessors {

    plugin: PlantumlPlugin;

    constructor(plugin: PlantumlPlugin) {
        this.plugin = plugin;
    }

    async generateLocalMap(source: string) : Promise<string> {
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
        const child = exec('java ' + args.join(" "), {encoding: 'binary'});

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

    async generateLocalImage(source: string, type: string) : Promise<string> {
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
        if(type === "png") {
            child = exec('java ' + args.join(" "), {encoding: 'binary'});
        }else {
            child = exec('java ' + args.join(" "), {encoding: 'utf-8'});
        }

        let stdout: any;
        let stderr: any;

        if (child.stdout) {
            child.stdout.on("data", (data: any) => {
                if(stdout === undefined) {
                    stdout = data;
                }else stdout += data;
            });
        }

        if(child.stderr) {
            child.stderr.on('data', (data: any) => {
                if(stderr === undefined) {
                    stderr = data;
                }else stderr += data;
            });
        }

        return new Promise((resolve, reject) => {
            child.on("error", reject);

            child.on("close", (code: any) => {
                if (code === 0) {
                    if(type === "png") {
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
                    if(type === "png") {
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
