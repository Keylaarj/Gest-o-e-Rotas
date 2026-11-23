import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeed } from './seed.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DB_FILE = path.join(currentDir, 'data', 'db.json');

function normalizeDb(data) {
  return {
    companies: Array.isArray(data?.companies) ? data.companies : [],
    clients: Array.isArray(data?.clients) ? data.clients : [],
    drivers: Array.isArray(data?.drivers) ? data.drivers : [],
    orders: Array.isArray(data?.orders) ? data.orders : [],
    stock: Array.isArray(data?.stock) ? data.stock : [],
    conversations:
      data?.conversations && typeof data.conversations === 'object' ? data.conversations : {}
  };
}

export function saveDb(db, file = DEFAULT_DB_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, file);
}

export function loadDb(file = DEFAULT_DB_FILE) {
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      try {
        fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
      } catch {
        // ignora falha ao mover o arquivo corrompido
      }
    }
    const seed = createSeed();
    saveDb(seed, file);
    return seed;
  }
}
