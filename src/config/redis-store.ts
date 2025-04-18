import { createClient } from 'redis';
// Import the necessary types from whatsapp-web.js if available, or define them
// Assuming 'Session' is the type expected by the 'save' method.
// You might need to import this type from 'whatsapp-web.js' or define it based on its structure.
// For example: import { Session } from 'whatsapp-web.js/src/structures';
// If the type is not exported, you might need to use 'any' or define a similar interface.
type Session = any; // Replace 'any' with the actual Session type if possible

interface SessionData {
    WABrowserId?: string;
    WASecretBundle?: string;
    WAToken1?: string;
    WAToken2?: string;
    // Add other properties if needed based on the actual Session structure
}

// Define the options type expected by sessionExists and delete
interface SessionOptions {
    session: string;
}

// Define the options type expected by extract
interface ExtractOptions {
    session: string;
    path: string; // The interface expects 'path' to be required
}

export class RedisStore {
    private client: ReturnType<typeof createClient>;
    private prefix = 'wwebjs:session:'; // Use a consistent prefix

    constructor(redisUrl: string) {
        this.client = createClient({ url: redisUrl });
        this.client.on('error', (err) => console.error('Redis Client Error', err));
        this.client.connect().catch(console.error);
    }

    /**
     * Check if a session exists.
     * @param options Object containing the session name (clientId).
     */
    async sessionExists(options: SessionOptions): Promise<boolean> {
        const sessionName = options.session;
        const exists = await this.client.exists(this.prefix + sessionName);
        return exists === 1;
    }

    /**
     * Save session data.
     * @param session The session data object.
     */
    async save(session: Session): Promise<void> {
        // Assuming session object has a 'id' or similar property for the key
        // Adjust 'session.id' based on the actual structure of the Session object
        const key = session.id || 'default'; // Use a proper identifier from the session object
        await this.client.set(this.prefix + key, JSON.stringify(session));
    }

    /**
     * Extract specific data from a session file.
     * @param options Object containing the session name and path.
     */
    async extract(options: ExtractOptions): Promise<SessionData | any | null> {
        const sessionName = options.session;
        const path = options.path; // Extract path from options

        const data = await this.client.get(this.prefix + sessionName);
        if (!data) return null;

        const sessionData = JSON.parse(data);

        // If a path is provided, try to extract the specific property.
        // This assumes 'path' is a simple property name. Adjust if it's more complex.
        if (path && sessionData.hasOwnProperty(path)) {
            return sessionData[path];
        }

        // If no path or path doesn't exist, return the whole session data (or null/undefined based on desired behavior)
        // The interface return type is 'any', so returning the whole object is valid.
        return sessionData;
    }

    /**
     * Delete a session.
     * @param options Object containing the session name (clientId).
     */
    async delete(options: SessionOptions): Promise<void> {
        const sessionName = options.session;
        await this.client.del(this.prefix + sessionName);
    }

    // --- Existing methods (potentially adjust if needed) ---

    // Get method might be used internally by extract or directly
    async get(key: string): Promise<SessionData | null> {
        const data = await this.client.get(this.prefix + key);
        return data ? JSON.parse(data) : null;
    }

    // Set method might be used internally by save or directly
    async set(key: string, value: SessionData): Promise<void> {
        await this.client.set(this.prefix + key, JSON.stringify(value));
    }

    // Remove method might be redundant if 'delete' is the required interface method
    // Keep it if used elsewhere, otherwise, 'delete' should suffice.
    async remove(key: string): Promise<void> {
        await this.client.del(this.prefix + key);
    }

    // List method might not be part of the required Store interface, keep if needed
    async list(): Promise<string[]> {
        const keys = await this.client.keys(this.prefix + '*');
        return keys.map(key => key.slice(this.prefix.length));
    }

    // Ensure the client disconnects gracefully
    async disconnect(): Promise<void> {
        if (this.client.isOpen) {
            await this.client.quit();
        }
    }
}