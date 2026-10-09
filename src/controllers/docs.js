import { createHash } from 'node:crypto';
import spec from '../../openapi.json' with { type: 'json' };
import { sendRepresentation } from '../utils/representation.js';

const bootstrap =
  "window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', persistAuthorization: false });";
export const bootstrapCspHash = `'sha256-${createHash('sha256').update(bootstrap).digest('base64')}'`;
const cdn = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1';
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SLSEA API docs</title>
  <link rel="stylesheet" href="${cdn}/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${cdn}/swagger-ui-bundle.js"></script>
  <script>${bootstrap}</script>
</body>
</html>`;

export function getDocs(_req, res) {
  sendRepresentation(res, html, 'text/html');
}

export function getOpenApi(_req, res) {
  sendRepresentation(res, spec);
}
