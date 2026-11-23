import { randomInt } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToken, getBearerToken, hashPassword, verifyPassword } from './auth.js';
import { DEFAULT_DB_FILE, loadDb, saveDb } from './db.js';
import { buildState } from './state.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(currentDir, '..', 'dist');
const emailPattern = /^\S+@\S+\.\S+$/;
const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
};

const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

const formatCnpj = (value) => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length > 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length > 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  if (digits.length > 5) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length > 2) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return digits;
};

const currentTime = () => new Date().toTimeString().slice(0, 5);

const httpError = (status, message) => Object.assign(new Error(message), { status });

const json = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
};

const fail = (res, status, message) => json(res, status, { error: message });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        tooLarge = true;
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(httpError(413, 'Corpo da requisição muito grande.'));
        return;
      }
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('formato inválido');
        }
        resolve(parsed);
      } catch {
        reject(httpError(400, 'JSON inválido.'));
      }
    });

    req.on('error', reject);
  });
}

function randomCode(prefix, taken) {
  let code;
  do {
    code =
      `${prefix}-` +
      Array.from({ length: 4 }, () => codeChars[randomInt(codeChars.length)]).join('');
  } while (taken(code));
  return code;
}

function serveStatic(req, res, pathname) {
  if (!existsSync(distRoot)) {
    fail(res, 404, 'Interface não compilada. Execute "npm run build".');
    return;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    fail(res, 400, 'Caminho inválido.');
    return;
  }

  const relative = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.resolve(distRoot, `.${path.sep}${relative}`);
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) {
    fail(res, 403, 'Acesso negado.');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    if (path.extname(decoded)) {
      fail(res, 404, 'Arquivo não encontrado.');
      return;
    }
    filePath = path.join(distRoot, 'index.html');
  }

  if (!existsSync(filePath)) {
    fail(res, 404, 'Arquivo não encontrado.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

export function createApp({ dbFile = process.env.DB_FILE || DEFAULT_DB_FILE } = {}) {
  const db = loadDb(dbFile);
  const sessions = new Map();

  const persist = () => saveDb(db, dbFile);

  const getSession = (req) => {
    const token = getBearerToken(req);
    if (!token) return null;
    return sessions.get(token) || null;
  };

  const requireRole = (req, res, roles) => {
    const session = getSession(req);
    if (!session) {
      fail(res, 401, 'Sessão expirada. Entre novamente.');
      return null;
    }
    if (roles && !roles.includes(session.role)) {
      fail(res, 403, 'Acesso não permitido.');
      return null;
    }
    return session;
  };

  const startSession = (role, userId, companyId) => {
    const token = createToken();
    const session = { role, userId, companyId };
    sessions.set(token, session);
    return { token, session };
  };

  const resolveConversation = (session, store, key) => {
    if (session.role === 'cliente') {
      const client = db.clients.find((item) => item.id === session.userId);
      if (!client) return { error: 'Cliente não encontrado.', status: 401 };
      if (store !== 'chats') return { error: 'Conversa inválida.', status: 400 };

      if (key.startsWith('empresa-')) {
        const companyId = key.slice('empresa-'.length);
        if (companyId !== client.empresaId) {
          return { error: 'Conversa inválida.', status: 403 };
        }
        return {
          conversationId: `conv-empresa-${companyId}-cliente-${client.id}`,
          kind: 'empresa-cliente',
          meta: { companyId, clientId: client.id },
          from: 'cliente'
        };
      }

      if (key.startsWith('entregador-')) {
        const order = db.orders.find(
          (item) => `entregador-${item.entregador}-${item.id}` === key
        );
        if (!order || order.cli !== client.id) {
          return { error: 'Conversa inválida.', status: 403 };
        }
        return {
          conversationId: `conv-entregador-${order.entregador}-pedido-${order.id}`,
          kind: 'cliente-entregador',
          meta: { driverId: order.entregador, clientId: client.id, orderId: order.id },
          from: 'cliente'
        };
      }

      return { error: 'Conversa inválida.', status: 400 };
    }

    if (session.role === 'admin') {
      if (store !== 'chatsA') return { error: 'Conversa inválida.', status: 400 };

      if (key.startsWith('cliente-')) {
        const clientId = key.slice('cliente-'.length);
        const client = db.clients.find((item) => item.id === clientId);
        if (!client || client.empresaId !== session.companyId) {
          return { error: 'Conversa inválida.', status: 403 };
        }
        return {
          conversationId: `conv-empresa-${session.companyId}-cliente-${clientId}`,
          kind: 'empresa-cliente',
          meta: { companyId: session.companyId, clientId },
          from: 'empresa'
        };
      }

      if (key.startsWith('entregador-')) {
        const driver = db.drivers.find(
          (item) => key === `entregador-${item.id}-${session.companyId}`
        );
        if (!driver || driver.empresaId !== session.companyId) {
          return { error: 'Conversa inválida.', status: 403 };
        }
        return {
          conversationId: `conv-entregador-${driver.id}-empresa-${session.companyId}`,
          kind: 'entregador-empresa',
          meta: { driverId: driver.id, companyId: session.companyId },
          from: 'empresa'
        };
      }

      return { error: 'Conversa inválida.', status: 400 };
    }

    if (session.role === 'entregador') {
      const driver = db.drivers.find((item) => item.id === session.userId);
      if (!driver) return { error: 'Entregador não encontrado.', status: 401 };

      if (key === `entregador-${driver.id}-${driver.empresaId}`) {
        if (store !== 'chatsA') return { error: 'Conversa inválida.', status: 400 };
        return {
          conversationId: `conv-entregador-${driver.id}-empresa-${driver.empresaId}`,
          kind: 'entregador-empresa',
          meta: { driverId: driver.id, companyId: driver.empresaId },
          from: 'entregador'
        };
      }

      const order = db.orders.find(
        (item) =>
          `entregador-${driver.id}-${item.id}` === key && item.empresaId === driver.empresaId
      );
      if (order) {
        if (store !== 'chats') return { error: 'Conversa inválida.', status: 400 };
        return {
          conversationId: `conv-entregador-${driver.id}-pedido-${order.id}`,
          kind: 'cliente-entregador',
          meta: { driverId: driver.id, clientId: order.cli, orderId: order.id },
          from: 'entregador'
        };
      }

      return { error: 'Conversa inválida.', status: 403 };
    }

    return { error: 'Acesso não permitido.', status: 403 };
  };

  const handleApi = async (req, res, pathname) => {
    if (req.method === 'POST' && pathname === '/api/auth/login/client') {
      const body = await readBody(req);
      const email = String(body.em || '').trim().toLowerCase();
      const password = String(body.pw || '').trim().toUpperCase();
      if (!emailPattern.test(email) || !password) {
        return fail(res, 400, 'Informe e-mail e senha.');
      }
      const client = db.clients.find(
        (item) => item.em.toLowerCase() === email && item.id === password
      );
      if (!client) {
        return fail(res, 401, 'E-mail ou senha inválidos. Use o ID de acesso gerado pela empresa.');
      }
      const { token, session } = startSession('cliente', client.id, client.empresaId);
      return json(res, 200, { token, state: buildState(db, session) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login/driver') {
      const body = await readBody(req);
      const email = String(body.em || '').trim().toLowerCase();
      const password = String(body.pw || '').trim().toUpperCase();
      if (!emailPattern.test(email) || !password) {
        return fail(res, 400, 'Informe e-mail e código.');
      }
      const driver = db.drivers.find(
        (item) => item.em.toLowerCase() === email && item.id === password
      );
      if (!driver) {
        return fail(res, 401, 'E-mail ou código inválidos. Use o código gerado pela empresa.');
      }
      const { token, session } = startSession('entregador', driver.id, driver.empresaId);
      return json(res, 200, { token, state: buildState(db, session) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login/company') {
      const body = await readBody(req);
      const cnpj = onlyDigits(body.cnpj);
      const password = String(body.pw || '');
      if (cnpj.length !== 14 || !password) {
        return fail(res, 400, 'Informe CNPJ e senha.');
      }
      const company = db.companies.find((item) => onlyDigits(item.cnpj) === cnpj);
      if (!company || !verifyPassword(password, company.senhaSalt, company.senhaHash)) {
        return fail(res, 401, 'CNPJ ou senha inválidos.');
      }
      const { token, session } = startSession('admin', company.id, company.id);
      return json(res, 200, { token, state: buildState(db, session) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/register/company') {
      const body = await readBody(req);
      const nome = String(body.nome || '').trim();
      const abertura = String(body.abertura || '').trim();
      const cnpjDigits = onlyDigits(body.cnpj);
      const email = String(body.em || '').trim();
      const password = String(body.pw || '');

      if (nome.length < 2) return fail(res, 400, 'Informe o nome da empresa.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(abertura)) {
        return fail(res, 400, 'Informe a data de abertura.');
      }
      if (cnpjDigits.length !== 14) return fail(res, 400, 'O CNPJ deve ter 14 dígitos.');
      if (!emailPattern.test(email)) return fail(res, 400, 'Digite um e-mail válido.');
      if (password.length < 6) {
        return fail(res, 400, 'A senha precisa ter ao menos 6 caracteres.');
      }
      if (db.companies.some((item) => onlyDigits(item.cnpj) === cnpjDigits)) {
        return fail(res, 409, 'Já existe uma empresa cadastrada com este CNPJ.');
      }

      const { salt, hash } = hashPassword(password);
      const company = {
        id: `cmp-${createToken().slice(0, 8)}`,
        nome,
        abertura,
        cnpj: formatCnpj(cnpjDigits),
        em: email,
        senhaSalt: salt,
        senhaHash: hash,
        alerts: true
      };
      db.companies.push(company);
      persist();

      const { token, session } = startSession('admin', company.id, company.id);
      return json(res, 201, { token, state: buildState(db, session) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const token = getBearerToken(req);
      if (token) sessions.delete(token);
      return json(res, 200, { ok: true });
    }

    if (
      req.method === 'GET' &&
      (pathname === '/api/session' || pathname === '/api/data')
    ) {
      const session = requireRole(req, res);
      if (!session) return;
      const state = buildState(db, session);
      if (!state) return fail(res, 401, 'Sessão inválida.');
      return json(res, 200, { state });
    }

    if (req.method === 'POST' && pathname === '/api/clients') {
      const session = requireRole(req, res, ['admin']);
      if (!session) return;
      const body = await readBody(req);
      const nome = String(body.nome || '').trim();
      const email = String(body.em || '').trim();
      if (nome.length < 3) return fail(res, 400, 'Informe o nome do cliente.');
      if (!emailPattern.test(email)) return fail(res, 400, 'Digite um e-mail válido.');
      if (db.clients.some((item) => item.em.toLowerCase() === email.toLowerCase())) {
        return fail(res, 409, 'Já existe um cliente com este e-mail.');
      }
      const id = randomCode('CLI', (code) =>
        db.clients.some((item) => item.id === code)
      );
      const client = {
        id,
        nome,
        em: email,
        empresaId: session.companyId,
        alerts: true
      };
      db.clients.push(client);
      persist();
      return json(res, 201, {
        client: { id, nome, em: email },
        state: buildState(db, session)
      });
    }

    if (req.method === 'POST' && pathname === '/api/drivers') {
      const session = requireRole(req, res, ['admin']);
      if (!session) return;
      const body = await readBody(req);
      const nome = String(body.nome || '').trim();
      const email = String(body.em || '').trim();
      const company = db.companies.find((item) => item.id === session.companyId);
      if (!company) return fail(res, 401, 'Empresa não encontrada.');
      if (nome.length < 3) return fail(res, 400, 'Informe o nome do entregador.');
      if (!emailPattern.test(email)) return fail(res, 400, 'Digite um e-mail válido.');
      if (db.drivers.some((item) => item.em.toLowerCase() === email.toLowerCase())) {
        return fail(res, 409, 'Já existe um entregador com este e-mail.');
      }
      const id = randomCode('ENT', (code) =>
        db.drivers.some((item) => item.id === code)
      );
      const driver = {
        id,
        nome,
        em: email,
        empresa: company.nome,
        empresaId: company.id,
        alerts: true
      };
      db.drivers.push(driver);
      persist();
      return json(res, 201, {
        driver: { id, nome, em: email, empresa: company.nome },
        state: buildState(db, session)
      });
    }

    const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      const session = requireRole(req, res, ['entregador']);
      if (!session) return;
      const orderId = decodeURIComponent(statusMatch[1]);
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) return fail(res, 404, 'Pedido não encontrado.');
      if (order.empresaId !== session.companyId) {
        return fail(res, 403, 'Acesso não permitido.');
      }
      const body = await readBody(req);
      const status = Number(body.st);
      if (!Number.isInteger(status) || status < 0 || status > 2) {
        return fail(res, 400, 'Status inválido.');
      }
      order.st = status;
      order.entregador = session.userId;
      persist();
      return json(res, 200, { state: buildState(db, session) });
    }

    const stockMatch = pathname.match(/^\/api\/stock\/([^/]+)(\/restock)?$/);
    if (stockMatch && ['PATCH', 'POST', 'DELETE'].includes(req.method)) {
      const session = requireRole(req, res, ['admin']);
      if (!session) return;
      const stockId = Number(decodeURIComponent(stockMatch[1]));
      const item = db.stock.find(
        (stock) => stock.id === stockId && stock.empresaId === session.companyId
      );
      if (!item) return fail(res, 404, 'Produto não encontrado.');

      if (req.method === 'PATCH' && !stockMatch[2]) {
        const body = await readBody(req);
        const nome = String(body.nome ?? item.nome).trim();
        const cor = String(body.cor ?? item.cor).trim();
        const tam = String(body.tam ?? item.tam).trim();
        if (!nome || !cor || !tam) {
          return fail(res, 400, 'Preencha nome, cor e tamanho.');
        }
        item.nome = nome;
        item.cor = cor;
        item.tam = tam;
        persist();
        return json(res, 200, { state: buildState(db, session) });
      }

      if (req.method === 'POST' && stockMatch[2] === '/restock') {
        item.q += 10;
        persist();
        return json(res, 200, { state: buildState(db, session) });
      }

      if (req.method === 'DELETE' && !stockMatch[2]) {
        db.stock = db.stock.filter((stock) => stock.id !== item.id);
        persist();
        return json(res, 200, { state: buildState(db, session) });
      }
    }

    if (req.method === 'POST' && pathname === '/api/chats/messages') {
      const session = requireRole(req, res);
      if (!session) return;
      const body = await readBody(req);
      const text = String(body.text || '').trim();
      const store = String(body.store || '');
      const key = String(body.key || '');
      if (!text) return fail(res, 400, 'Digite uma mensagem.');
      if (text.length > 2000) return fail(res, 400, 'Mensagem muito longa.');

      const resolved = resolveConversation(session, store, key);
      if (resolved.error) return fail(res, resolved.status, resolved.error);

      const conversation =
        db.conversations[resolved.conversationId] ||
        (db.conversations[resolved.conversationId] = {
          id: resolved.conversationId,
          kind: resolved.kind,
          ...resolved.meta,
          msgs: []
        });

      conversation.msgs.push({ from: resolved.from, t: text, h: currentTime() });
      persist();
      return json(res, 200, { state: buildState(db, session) });
    }

    if (req.method === 'PATCH' && pathname === '/api/profile/alerts') {
      const session = requireRole(req, res);
      if (!session) return;
      const body = await readBody(req);
      if (typeof body.alerts !== 'boolean') {
        return fail(res, 400, 'Valor inválido.');
      }
      if (session.role === 'cliente') {
        const client = db.clients.find((item) => item.id === session.userId);
        if (client) client.alerts = body.alerts;
      } else if (session.role === 'admin') {
        const company = db.companies.find((item) => item.id === session.companyId);
        if (company) company.alerts = body.alerts;
      } else if (session.role === 'entregador') {
        const driver = db.drivers.find((item) => item.id === session.userId);
        if (driver) driver.alerts = body.alerts;
      }
      persist();
      return json(res, 200, { state: buildState(db, session) });
    }

    return fail(res, 404, 'Rota não encontrada.');
  };

  const handler = async (req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      fail(res, 400, 'Requisição inválida.');
      return;
    }

    if (pathname === '/api/health') {
      json(res, 200, { ok: true });
      return;
    }

    if (pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, pathname);
      } catch (err) {
        const status = err.status || 500;
        if (status >= 500) console.error(err);
        if (!res.headersSent) {
          fail(res, status, status >= 500 ? 'Erro interno do servidor.' : err.message);
        } else {
          res.end();
        }
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fail(res, 405, 'Método não permitido.');
      return;
    }

    serveStatic(req, res, pathname);
  };

  return { handler, db, sessions, dbFile };
}
