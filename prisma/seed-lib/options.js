import { CliUsageError } from '../../src/utils/cli.js';

export function parseSeedArgs(args) {
  let confirmed = false;
  let scale = 'full';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--yes') confirmed = true;
    else if (argument === '--scale') scale = args[++index];
    else if (argument.startsWith('--scale='))
      scale = argument.slice('--scale='.length);
    else
      throw new CliUsageError('Seed accepts only --yes and --scale full|test.');
  }
  if (!['full', 'test'].includes(scale))
    throw new CliUsageError('Seed scale must be full or test.');
  return { confirmed, scale };
}

export function requireSeedConfirmation({ confirmed }, settings) {
  if (!confirmed && !settings.seedConfirm)
    throw new CliUsageError(
      'Seed is destructive. Check the printed database host, then pass --yes or set SEED_CONFIRM=yes.',
    );
}
