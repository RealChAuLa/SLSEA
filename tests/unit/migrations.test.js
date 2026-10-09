import { readFileSync } from 'node:fs';

test('deployable migration history includes initial tables before CHECK constraints', () => {
  const initial = readFileSync(
    new URL(
      '../../prisma/migrations/20261009000100_initial_schema/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  for (const table of [
    'provinces',
    'districts',
    'grid_substations',
    'solar_installations',
    'generation_readings',
    'users',
  ]) {
    expect(initial).toContain(`CREATE TABLE "${table}"`);
  }
  const constraints = readFileSync(
    new URL(
      '../../prisma/migrations/20261009000200_check_constraints/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  expect(constraints).toContain('users_jurisdiction_chk');
  expect(constraints).toContain('readings_values_chk');
});
