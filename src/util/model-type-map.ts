import { DocumentType } from "@apicurio/data-models";

/**
 * A human-friendly model type string that distinguishes between specific
 * OpenAPI/AsyncAPI versions, unlike the library's DocumentType enum which
 * groups versions together.
 */
export type ModelType = "openapi2" | "openapi3" | "asyncapi2";

/**
 * Map a ModelType string to the library's DocumentType enum.
 *
 * @param modelType the human-friendly model type
 * @returns the corresponding DocumentType enum value
 */
export function toDocumentType(modelType: ModelType): DocumentType {
    switch (modelType) {
        case "openapi2":
            return DocumentType.openapi2;
        case "openapi3":
            return DocumentType.openapi3;
        case "asyncapi2":
            return DocumentType.asyncapi2;
        default:
            throw new Error(`Unknown model type: ${modelType}`);
    }
}

/**
 * Map a DocumentType enum value to a ModelType string.
 *
 * @param docType the library DocumentType
 * @returns a human-friendly model type string
 */
export function fromDocumentType(docType: DocumentType): ModelType {
    switch (docType) {
        case DocumentType.openapi2:
            return "openapi2";
        case DocumentType.openapi3:
            return "openapi3";
        case DocumentType.asyncapi2:
            return "asyncapi2";
        default:
            throw new Error(`Unknown DocumentType: ${docType}`);
    }
}

/** All valid model type strings. */
export const ALL_MODEL_TYPES: ModelType[] = ["openapi2", "openapi3", "asyncapi2"];
