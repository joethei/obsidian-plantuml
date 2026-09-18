import {defineConfig} from "vitest/config";
import {fileURLToPath} from "url";

export default defineConfig({
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
        },
    },
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/setup.ts"],
    },
});
