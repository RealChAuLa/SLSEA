import { z } from 'zod';

const schema = z.object({}).strict();

export function validateEmptyQuery(req, _res, next) {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return next(parsed.error);
  next();
}
