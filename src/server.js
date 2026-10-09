import app from './app.js';
import { config } from './config/index.js';

const server = app.listen(config.port, () => {
  console.info(`SLSEA API listening on http://localhost:${config.port}`);
});
server.on('error', (error) => {
  // Avoid printing environment values or arbitrary error messages.
  console.error(`Unable to start HTTP server (${error.code ?? 'UNKNOWN'}).`);
  process.exitCode = 1;
});
