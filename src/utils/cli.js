import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from './logger.js';

export class CliUsageError extends Error {}

export function isMainModule(moduleUrl) {
  return Boolean(
    process.argv[1] &&
    moduleUrl === pathToFileURL(resolve(process.argv[1])).href,
  );
}

export async function runCli(task, action) {
  try {
    await action();
  } catch (error) {
    if (
      error instanceof CliUsageError ||
      /^Invalid environment configuration: [A-Z_, .]+\.$/.test(error.message)
    )
      console.error(error.message);
    else
      console.error(
        `${task} failed. Database diagnostics and credentials are omitted; inspect the target and configuration before retrying.`,
      );
    logger.error({ event: `${task}_failed`, error });
    process.exitCode = 1;
  }
}
