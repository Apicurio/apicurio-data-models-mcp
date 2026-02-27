import * as yaml from "js-yaml";

export type DocumentFormat = "json" | "yaml";

/**
 * Detect whether a string is JSON or YAML.
 *
 * @param content the raw file content
 * @returns the detected format
 */
export function detectFormat(content: string): DocumentFormat {
    const trimmed = content.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "json";
    }
    return "yaml";
}

/**
 * Parse a string as either JSON or YAML, returning a plain JS object.
 *
 * @param content the raw content string
 * @param format optional format hint; auto-detected if omitted
 * @returns the parsed JS object
 */
export function parseContent(content: string, format?: DocumentFormat): any {
    const fmt = format ?? detectFormat(content);
    if (fmt === "json") {
        return JSON.parse(content);
    }
    return yaml.load(content);
}

/**
 * Serialize a JS object to JSON or YAML string.
 *
 * @param obj the object to serialize
 * @param format the desired output format
 * @returns the serialized string
 */
export function serializeContent(obj: any, format: DocumentFormat): string {
    if (format === "json") {
        return JSON.stringify(obj, null, 2);
    }
    return yaml.dump(obj, { lineWidth: -1, noRefs: true, sortKeys: false });
}
