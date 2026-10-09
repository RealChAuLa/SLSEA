import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

// Factory for owner tools and isolated tests; the runtime singleton lives in db.js.
export function createDatabaseClient(
  databaseUrl,
  { queryLogging = false } = {},
) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });
  return new PrismaClient({
    adapter,
    errorFormat: 'minimal',
    log: queryLogging ? [{ emit: 'event', level: 'query' }] : [],
  });
}
