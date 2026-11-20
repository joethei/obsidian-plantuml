import {describe, expect, it, vi} from "vitest";
import {DiagramCache} from "../src/cache";

vi.mock("../src/idbStore", () => ({
    IdbStore: class {
        getItem = vi.fn(async () => {
            throw new Error("Internal error opening backing store");
        });
        setItem = vi.fn(async () => {
            throw new Error("Internal error opening backing store");
        });
    },
}));

describe("DiagramCache without IndexedDB", () => {
    it("treats a failing store as a cache miss, so diagrams still render", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const cache = new DiagramCache();

        await expect(cache.get("ENCODED")).resolves.toBeNull();
        await expect(cache.set("ENCODED", {ts: 1, svg: "<svg/>", includes: ["common.puml"]})).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
