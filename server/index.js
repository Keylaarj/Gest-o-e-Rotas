import { createServer } from 'node:http';
import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT || 3001);

const server = createServer(app.handler);

server.listen(port, () => {
  console.log(`Gestão e Rotas — servidor disponível em http://localhost:${port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
