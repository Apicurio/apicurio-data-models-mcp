import type { Document, ModelType as LibModelType } from "@apicurio/data-models";
import type { DocumentFormat } from "./util/format.js";

/**
 * Represents a single loaded document session.
 */
export interface SessionEntry {
    name: string;
    document: Document;
    modelType: LibModelType;
    filePath: string | null;
    format: DocumentFormat;
    createdAt: Date;
    lastModifiedAt: Date;
}

/**
 * Manages named document sessions. Sessions are ephemeral and live
 * for the lifetime of the MCP server process.
 */
export class SessionManager {
    private sessions: Map<string, SessionEntry> = new Map();

    /**
     * Check whether a session with the given name exists.
     *
     * @param name the session name
     * @returns true if the session exists
     */
    hasSession(name: string): boolean {
        return this.sessions.has(name);
    }

    /**
     * Get a session by name. Throws if the session does not exist.
     *
     * @param name the session name
     * @returns the session entry
     */
    getSession(name: string): SessionEntry {
        const session = this.sessions.get(name);
        if (!session) {
            throw new Error(`Session '${name}' not found`);
        }
        return session;
    }

    /**
     * Add a new session. Throws if a session with the same name already exists.
     *
     * @param entry the session entry to add
     */
    addSession(entry: SessionEntry): void {
        if (this.sessions.has(entry.name)) {
            throw new Error(`Session '${entry.name}' already exists`);
        }
        this.sessions.set(entry.name, entry);
    }

    /**
     * Remove a session by name. Throws if the session does not exist.
     *
     * @param name the session name
     */
    removeSession(name: string): void {
        if (!this.sessions.has(name)) {
            throw new Error(`Session '${name}' not found`);
        }
        this.sessions.delete(name);
    }

    /**
     * List all active sessions as an array of session entries.
     *
     * @returns all active sessions
     */
    listSessions(): SessionEntry[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Update the lastModifiedAt timestamp for a session.
     *
     * @param name the session name
     */
    touchSession(name: string): void {
        const session = this.getSession(name);
        session.lastModifiedAt = new Date();
    }
}

/** Singleton session manager instance. */
export const sessionManager = new SessionManager();
