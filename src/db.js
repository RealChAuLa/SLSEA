import { loadDatabaseConfig } from './config/data.js';
import { createDatabaseClient } from './database-client.js';

// One client per process, reused by all requests/invocations that import it.
export const db = createDatabaseClient(loadDatabaseConfig().databaseUrl);
export default db;
