import { canManageUser } from '../../src/policy/manageUser.js';
import { parsePasswordChange } from '../../src/utils/password-input.js';
const caller = (type, id) => ({
  kind: 'user',
  user_id: 1,
  jurisdiction_type: type,
  jurisdiction_id: id,
});
const target = (type, id, province_id) => ({
  user_id: 2,
  jurisdiction_type: type,
  jurisdiction_id: id,
  province_id,
});
test.each([
  ['national', null, 'provincial', 1, 1, true],
  ['national', null, 'district', 1, 1, true],
  ['national', null, 'national', null, null, false],
  ['provincial', 1, 'district', 1, 1, true],
  ['provincial', 1, 'district', 4, 2, false],
  ['provincial', 1, 'provincial', 2, 2, false],
  ['district', 1, 'district', 1, 1, false],
  ['district', 1, 'provincial', 1, 1, false],
  ['district', 1, 'national', null, null, false],
])(
  '%s manages %s only at a lower level within jurisdiction',
  (role, id, targetRole, targetId, province, expected) => {
    expect(
      canManageUser(caller(role, id), target(targetRole, targetId, province)),
    ).toBe(expected);
  },
);
test('management policy fails closed for malformed or device principals/targets', () => {
  for (const value of [
    null,
    { kind: 'device' },
    caller('unknown', 1),
    caller('provincial', null),
  ])
    expect(canManageUser(value, target('district', 1, 1))).toBe(false);
  expect(
    canManageUser(caller('provincial', 1), target('district', 1, undefined)),
  ).toBe(false);
  expect(canManageUser(caller('national', null), null)).toBe(false);
});
test('password policy is strict, counts Unicode characters and avoids bcrypt truncation', () => {
  expect(
    parsePasswordChange(
      { current_password: 'old', new_password: 'Brighter#Sun2027' },
      true,
    ).new_password,
  ).toBe('Brighter#Sun2027');
  expect(
    parsePasswordChange({ new_password: 'සූර්යenergy2027' }, false)
      .new_password,
  ).toBe('සූර්යenergy2027');
  for (const input of [
    { new_password: 'short1' },
    { new_password: '1234567890' },
    { new_password: 'abcdefghijk' },
    { new_password: '😀'.repeat(7) + 'a1' },
    { new_password: 'é'.repeat(36) + '1' },
    { new_password: 'Brighter2027', current_password: 'extra' },
    { new_password: 'Brighter2027', password_hash: 'extra' },
  ])
    expect(() => parsePasswordChange(input, false)).toThrow();
  expect(() =>
    parsePasswordChange({ new_password: 'Brighter2027' }, true),
  ).toThrow();
});
