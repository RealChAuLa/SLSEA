import { defineConfig } from 'prisma/config';
import { loadMigrationConfig } from './src/config/data.js';

const { directUrl } = loadMigrationConfig(undefined, { required: false });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  // Offline schema diff still requires a datasource in Prisma 7.10. Migration
  // and seed wrappers require a real DIRECT_URL before invoking Prisma.
  datasource: {
    url: directUrl ?? 'postgresql://offline:offline@localhost/slsea_offline',
  },
});
