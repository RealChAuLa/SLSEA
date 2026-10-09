import { Prisma } from '../generated/prisma/client.js';
import {
  manageableUserPredicate,
  requireManageUser,
} from '../policy/manageUser.js';
import { serialize } from '../serializers/index.js';
import { parseId } from './hierarchy.js';
import {
  invalidQuery,
  parsePagination,
  collectionEnvelope,
} from '../utils/pagination.js';
import { loadPaginationConfig } from '../config/data.js';
import { parseSort } from '../utils/sort.js';
import { parsePasswordChange } from '../utils/password-input.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { ApiError } from '../errors/api-error.js';

function emptyQuery(req) {
  if (Object.keys(req.query).length)
    throw invalidQuery('query', 'contains an unsupported parameter');
}
async function resolveUser(db, id) {
  const [row] =
    await db.$queryRaw`SELECT u.user_id,u.name,u.email,u.jurisdiction_type,u.jurisdiction_id,d.province_id FROM users u LEFT JOIN districts d ON u.jurisdiction_type='district' AND d.district_id=u.jurisdiction_id WHERE u.user_id=${id}::int`;
  if (!row)
    throw new ApiError('NOT_FOUND', 404, 'The requested user was not found.');
  return row;
}
export async function listUsers(db, req) {
  for (const field of Object.keys(req.query))
    if (!['page', 'page_size', 'sort'].includes(field))
      throw invalidQuery('query', 'contains an unsupported parameter');
  const pagination = parsePagination(req.query, loadPaginationConfig());
  const [sort] = parseSort(req.query.sort ?? 'name', 'user_id');
  const order =
    sort.name === 'desc'
      ? Prisma.sql`u.name DESC,u.user_id ASC`
      : Prisma.sql`u.name ASC,u.user_id ASC`;
  const selection = Prisma.sql`FROM users u LEFT JOIN districts d ON u.jurisdiction_type='district' AND d.district_id=u.jurisdiction_id WHERE (${manageableUserPredicate(req.principal)}) AND u.user_id <> ${req.principal.user_id}::int`;
  const [counts, rows] = await db.$transaction(
    [
      db.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS count ${selection}`),
      db.$queryRaw(
        Prisma.sql`SELECT u.user_id,u.name,u.email,u.jurisdiction_type,u.jurisdiction_id ${selection} ORDER BY ${order} LIMIT ${pagination.pageSize}::int OFFSET ${pagination.skip}::int`,
      ),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return collectionEnvelope(
    req,
    rows.map((row) => serialize('user', row)),
    Number(counts[0].count),
    pagination,
  );
}
export async function getUser(db, req, { self = false } = {}) {
  emptyQuery(req);
  const id = self ? req.principal.user_id : parseId(req.params.userId);
  const row = self ? req.user : await resolveUser(db, id);
  if (id !== req.principal.user_id) requireManageUser(req.principal, row);
  return serialize('user', row);
}
export async function changePassword(db, req, { self = false } = {}) {
  emptyQuery(req);
  const id = self ? req.principal.user_id : parseId(req.params.userId);
  const own = id === req.principal.user_id;
  const ids = [...new Set([id, req.principal.user_id])].sort((a, b) => a - b);
  await db.$transaction(
    async (tx) => {
      // Lock caller and target in the same order to avoid competing reset deadlocks.
      const locked = await tx.$queryRaw(
        Prisma.sql`SELECT user_id,password_hash FROM users WHERE user_id IN (${Prisma.join(ids)}) ORDER BY user_id FOR NO KEY UPDATE`,
      );
      const actor = locked.find((row) => row.user_id === req.principal.user_id);
      if (!actor || actor.password_hash !== req.user.password_hash)
        throw new ApiError(
          'TOKEN_REVOKED',
          401,
          'The bearer token has been revoked.',
        );
      const target = locked.find((row) => row.user_id === id);
      if (!target)
        throw new ApiError(
          'NOT_FOUND',
          404,
          'The requested user was not found.',
        );
      if (!own) requireManageUser(req.principal, await resolveUser(tx, id));
      const input = parsePasswordChange(req.body, own);
      if (own) {
        if (
          !(await comparePassword(input.current_password, target.password_hash))
        )
          throw new ApiError(
            'CURRENT_PASSWORD_INCORRECT',
            403,
            'The current password is incorrect.',
          );
        if (await comparePassword(input.new_password, target.password_hash))
          throw new ApiError(
            'VALIDATION_FAILED',
            400,
            'Request validation failed.',
            [
              {
                field: 'new_password',
                issue: 'must differ from the current password',
              },
            ],
          );
      }
      const password_hash = await hashPassword(input.new_password);
      await tx.user.update({ where: { user_id: id }, data: { password_hash } });
    },
    { isolationLevel: 'ReadCommitted', timeout: 15000, maxWait: 10000 },
  );
}
