import { z } from 'zod';
import { comparePassword } from '../utils/password.js';
import { ApiError } from '../errors/api-error.js';

const credentials = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
  })
  .strict();
// Public, unusable cost-12 comparison fixture; avoids extra hashing on the first
// unknown-account request. It is never accepted as an account credential.
const dummyHash =
  '$2b$12$uDQTYOrUarAnYXifwezOrOKgSTRK2.6XWnvBYcNmJ9LF3GWna0dNK';
export async function issueToken(db, tokens, body) {
  const input = credentials.parse(body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  // One shared dummy hash at the same cost as seeded passwords; compare even
  // when the account is absent so failure does not reveal account existence.
  const hash = user?.password_hash ?? dummyHash;
  const correct = await comparePassword(input.password, hash);
  if (!user || !correct)
    throw new ApiError(
      'UNAUTHENTICATED',
      401,
      'Email or password is incorrect.',
    );
  const access_token = tokens.signUserToken(user);
  const claims = tokens.verifyToken(access_token);
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: claims.exp - claims.iat,
    scope: claims.scope,
  };
}
