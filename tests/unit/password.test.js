import bcrypt from 'bcryptjs';
import { hashPassword, comparePassword } from '../../src/utils/password.js';

test('password helper uses bcrypt cost >= 10 and distinguishes correct/incorrect passwords', async () => {
  const hash = await hashPassword('Fixture#Password2026');
  expect(hash).not.toContain('Fixture#Password2026');
  expect(bcrypt.getRounds(hash)).toBeGreaterThanOrEqual(10);
  expect(await comparePassword('Fixture#Password2026', hash)).toBe(true);
  expect(await comparePassword('Wrong#Password2026', hash)).toBe(false);
});

test('password helper prevents silent bcrypt truncation, including multibyte input', async () => {
  await expect(hashPassword('é'.repeat(37))).rejects.toThrow();
  const hash = await hashPassword('x'.repeat(72));
  expect(await comparePassword('x'.repeat(72) + 'different', hash)).toBe(false);
});
