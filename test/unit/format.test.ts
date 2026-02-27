import { describe, expect, it } from "vitest";
import { detectFormat, parseContent, serializeContent } from "../../src/util/format.js";

describe("detectFormat", () => {
    it("detects JSON when content starts with {", () => {
        expect(detectFormat('{"openapi": "3.0.0"}')).toBe("json");
    });

    it("detects JSON when content starts with [", () => {
        expect(detectFormat("[1, 2, 3]")).toBe("json");
    });

    it("detects JSON with leading whitespace", () => {
        expect(detectFormat('  \n  {"openapi": "3.0.0"}')).toBe("json");
    });

    it("detects YAML when content does not start with { or [", () => {
        expect(detectFormat("openapi: 3.0.0\ninfo:")).toBe("yaml");
    });

    it("detects YAML for key-value style", () => {
        expect(detectFormat("title: My API\nversion: 1.0")).toBe("yaml");
    });
});

describe("parseContent", () => {
    it("parses JSON content", () => {
        const result = parseContent('{"foo": "bar"}', "json");
        expect(result).toEqual({ foo: "bar" });
    });

    it("parses YAML content", () => {
        const result = parseContent("foo: bar\nbaz: 42", "yaml");
        expect(result).toEqual({ foo: "bar", baz: 42 });
    });

    it("auto-detects JSON format", () => {
        const result = parseContent('{"foo": "bar"}');
        expect(result).toEqual({ foo: "bar" });
    });

    it("auto-detects YAML format", () => {
        const result = parseContent("foo: bar");
        expect(result).toEqual({ foo: "bar" });
    });

    it("throws on invalid JSON", () => {
        expect(() => parseContent("{bad json}", "json")).toThrow();
    });
});

describe("serializeContent", () => {
    it("serializes to JSON", () => {
        const result = serializeContent({ foo: "bar" }, "json");
        expect(JSON.parse(result)).toEqual({ foo: "bar" });
        expect(result).toContain('"foo"');
    });

    it("serializes to YAML", () => {
        const result = serializeContent({ foo: "bar" }, "yaml");
        expect(result).toContain("foo: bar");
    });

    it("produces pretty-printed JSON", () => {
        const result = serializeContent({ a: 1, b: 2 }, "json");
        expect(result).toContain("\n");
    });
});
