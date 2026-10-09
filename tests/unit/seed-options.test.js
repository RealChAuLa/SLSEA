import {
  parseSeedArgs,
  requireSeedConfirmation,
} from '../../prisma/seed-lib/options.js';

test('destructive seeding always requires an explicit flag or environment confirmation', () => {
  expect(() =>
    requireSeedConfirmation(parseSeedArgs([]), { seedConfirm: false }),
  ).toThrow(/destructive/);
  expect(() =>
    requireSeedConfirmation(parseSeedArgs(['--yes']), { seedConfirm: false }),
  ).not.toThrow();
  expect(() =>
    requireSeedConfirmation(parseSeedArgs([]), { seedConfirm: true }),
  ).not.toThrow();
  expect(parseSeedArgs(['--scale', 'test', '--yes'])).toEqual({
    scale: 'test',
    confirmed: true,
  });
  expect(parseSeedArgs(['--scale=test'])).toEqual({
    scale: 'test',
    confirmed: false,
  });
});

test('invalid CLI input is rejected without echoing possibly-sensitive arguments', () => {
  expect(() => parseSeedArgs(['--scale'])).toThrow(/full or test/);
  expect(() => parseSeedArgs(['--scale=typo'])).toThrow();
  expect(() => parseSeedArgs(['private-argument-value'])).toThrow(
    'Seed accepts only --yes and --scale full|test.',
  );
});
