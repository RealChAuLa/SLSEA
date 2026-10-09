import { hashPassword } from '../../src/utils/password.js';
import { createDeviceTokenFile } from './tokens.js';
import { selfCheckReferenceData } from './self-check.js';

export async function seedReferenceData(
  db,
  dataset,
  { seedDemoPassword, tokens },
) {
  // All input/token/hash work finishes before any destructive database query.
  const passwordHash = await hashPassword(seedDemoPassword);
  const tokenFile = createDeviceTokenFile(dataset.installations, tokens);
  const users = dataset.users.map((user) => ({
    ...user,
    password_hash: passwordHash,
  }));
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`TRUNCATE TABLE generation_readings, users, solar_installations, grid_substations, districts, provinces RESTART IDENTITY CASCADE`;
      await tx.province.createMany({ data: dataset.provinces });
      await tx.district.createMany({ data: dataset.districts });
      await tx.gridSubstation.createMany({ data: dataset.substations });
      await tx.solarInstallation.createMany({ data: dataset.installations });
      await tx.user.createMany({ data: users });
      // Fixed, tagged SQL; explicit IDs do not advance PostgreSQL sequences.
      // The bigint results stay internal and are never serialized.
      await tx.$queryRaw`SELECT
      setval(pg_get_serial_sequence('provinces', 'province_id'), (SELECT max(province_id) FROM provinces), true),
      setval(pg_get_serial_sequence('districts', 'district_id'), (SELECT max(district_id) FROM districts), true),
      setval(pg_get_serial_sequence('grid_substations', 'substation_id'), (SELECT max(substation_id) FROM grid_substations), true),
      setval(pg_get_serial_sequence('solar_installations', 'site_id'), (SELECT max(site_id) FROM solar_installations), true),
      setval(pg_get_serial_sequence('users', 'user_id'), (SELECT max(user_id) FROM users), true)`;
    },
    { timeout: 30000, maxWait: 10000 },
  );
  const summary = await selfCheckReferenceData(db, dataset, tokenFile, tokens);
  return { tokenFile, summary };
}
