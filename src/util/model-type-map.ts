import { ModelType as LibModelType } from "@apicurio/data-models";

/**
 * A human-friendly model type string that distinguishes between specific
 * OpenAPI/AsyncAPI versions, unlike the library's ModelType enum which
 * has a separate value for each minor version.
 */
export type ModelType = "openapi2" | "openapi3" | "asyncapi2" | "asyncapi3";

/**
 * Map a ModelType string to the library's ModelType enum.
 *
 * @param modelType the human-friendly model type
 * @returns the corresponding LibModelType enum value
 */
export function toLibModelType(modelType: ModelType): LibModelType {
    switch (modelType) {
        case "openapi2":
            return LibModelType.OPENAPI20;
        case "openapi3":
            return LibModelType.OPENAPI30;
        case "asyncapi2":
            return LibModelType.ASYNCAPI20;
        case "asyncapi3":
            return LibModelType.ASYNCAPI30;
        default:
            throw new Error(`Unknown model type: ${modelType}`);
    }
}

/**
 * Map a library ModelType enum value to a human-friendly ModelType string.
 *
 * @param libModelType the library ModelType
 * @returns a human-friendly model type string
 */
export function fromLibModelType(libModelType: LibModelType): ModelType {
    switch (libModelType) {
        case LibModelType.OPENAPI20:
            return "openapi2";
        case LibModelType.OPENAPI30:
        case LibModelType.OPENAPI31:
            return "openapi3";
        case LibModelType.ASYNCAPI20:
        case LibModelType.ASYNCAPI21:
        case LibModelType.ASYNCAPI22:
        case LibModelType.ASYNCAPI23:
        case LibModelType.ASYNCAPI24:
        case LibModelType.ASYNCAPI25:
        case LibModelType.ASYNCAPI26:
            return "asyncapi2";
        case LibModelType.ASYNCAPI30:
            return "asyncapi3";
        default:
            throw new Error(`Unsupported ModelType: ${libModelType}`);
    }
}

/** All valid model type strings. */
export const ALL_MODEL_TYPES: ModelType[] = ["openapi2", "openapi3", "asyncapi2", "asyncapi3"];
