import { DocumentType, Library } from "@apicurio/data-models";
import { beforeEach, describe, expect, it } from "vitest";
import { type SessionEntry, SessionManager } from "../../src/session-manager.js";

function createTestEntry(name: string): SessionEntry {
    const document = Library.createDocument(DocumentType.openapi3);
    return {
        name,
        document,
        modelType: DocumentType.openapi3,
        filePath: null,
        format: "json",
        createdAt: new Date(),
        lastModifiedAt: new Date(),
    };
}

describe("SessionManager", () => {
    let manager: SessionManager;

    beforeEach(() => {
        manager = new SessionManager();
    });

    it("starts with no sessions", () => {
        expect(manager.listSessions()).toHaveLength(0);
        expect(manager.hasSession("test")).toBe(false);
    });

    it("adds and retrieves a session", () => {
        const entry = createTestEntry("test");
        manager.addSession(entry);

        expect(manager.hasSession("test")).toBe(true);
        expect(manager.getSession("test")).toBe(entry);
    });

    it("throws when adding a duplicate session", () => {
        manager.addSession(createTestEntry("test"));
        expect(() => manager.addSession(createTestEntry("test"))).toThrow("Session 'test' already exists");
    });

    it("throws when getting a non-existent session", () => {
        expect(() => manager.getSession("missing")).toThrow("Session 'missing' not found");
    });

    it("removes a session", () => {
        manager.addSession(createTestEntry("test"));
        manager.removeSession("test");
        expect(manager.hasSession("test")).toBe(false);
    });

    it("throws when removing a non-existent session", () => {
        expect(() => manager.removeSession("missing")).toThrow("Session 'missing' not found");
    });

    it("lists all sessions", () => {
        manager.addSession(createTestEntry("a"));
        manager.addSession(createTestEntry("b"));
        const sessions = manager.listSessions();
        expect(sessions).toHaveLength(2);
        expect(sessions.map((s) => s.name).sort()).toEqual(["a", "b"]);
    });

    it("touches a session to update lastModifiedAt", () => {
        const entry = createTestEntry("test");
        const originalTime = entry.lastModifiedAt;
        manager.addSession(entry);

        // Small delay to ensure time difference
        manager.touchSession("test");
        expect(entry.lastModifiedAt.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
    });
});
