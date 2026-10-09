// Called only by Jest setup, before the application/config modules are loaded.
export function configureTestEnvironment() {
  process.env.RATE_LIMIT_ENABLED = 'false';
}
