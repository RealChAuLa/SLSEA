import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { now } from '../../src/utils/clock.js';

export function createDeviceTokenFile(
  installations,
  tokens,
  { clock = now } = {},
) {
  return {
    generated_at: clock().toISOString(),
    issuer: tokens.issuer,
    audience: tokens.audience,
    tokens: installations.map((installation) => ({
      site_id: installation.site_id,
      meter_id: installation.meter_id,
      token: tokens.signDeviceToken(installation),
    })),
  };
}

export async function writeDeviceTokenFile(tokenFile) {
  const target = fileURLToPath(
    new URL('../../seed-output/device-tokens.json', import.meta.url),
  );
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(tokenFile, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readInstallations(db) {
  const installations = [];
  let cursor;
  while (true) {
    const page = await db.solarInstallation.findMany({
      take: 1000,
      orderBy: { site_id: 'asc' },
      ...(cursor ? { cursor: { site_id: cursor }, skip: 1 } : {}),
      select: { site_id: true, meter_id: true },
    });
    installations.push(...page);
    if (page.length < 1000) break;
    cursor = page.at(-1).site_id;
  }
  return installations;
}
