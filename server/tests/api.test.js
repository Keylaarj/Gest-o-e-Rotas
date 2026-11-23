import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../app.js';

let app;
let server;
let base;
let tempDir;

before(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'gestao-rotas-'));
  app = createApp({ dbFile: path.join(tempDir, 'db.json') });
  server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tempDir, { recursive: true, force: true });
});

async function request(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { status: response.status, data };
}

async function loginClient(email = 'maria@email.com', password = 'CLI-7K2M') {
  return request('/api/auth/login/client', {
    method: 'POST',
    body: { em: email, pw: password }
  });
}

async function loginCompany(cnpj = '12.345.678/0001-90', password = '123456') {
  return request('/api/auth/login/company', {
    method: 'POST',
    body: { cnpj, pw: password }
  });
}

async function loginDriver(email = 'carlos@translog.com.br', password = 'ENT-8H2K') {
  return request('/api/auth/login/driver', {
    method: 'POST',
    body: { em: email, pw: password }
  });
}

test('health check responde ok', async () => {
  const { status, data } = await request('/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('login do cliente devolve estado com pedidos e conversas', async () => {
  const { status, data } = await loginClient();
  assert.equal(status, 200);
  assert.ok(data.token);
  assert.equal(data.state.role, 'cliente');
  assert.equal(data.state.user.id, 'CLI-7K2M');
  assert.equal(data.state.orders.length, 3);
  assert.ok(data.state.chats['empresa-cmp-translog']);
  assert.ok(data.state.chats['entregador-ENT-8H2K-P-1042']);
  assert.equal(data.state.chatsA && Object.keys(data.state.chatsA).length, 0);
});

test('login da empresa devolve visão administrativa', async () => {
  const { status, data } = await loginCompany();
  assert.equal(status, 200);
  assert.equal(data.state.role, 'admin');
  assert.equal(data.state.user.companyId, 'cmp-translog');
  assert.equal(data.state.orders.length, 4);
  assert.equal(data.state.stock.length, 4);
  assert.ok(data.state.chatsA['cliente-CLI-7K2M']);
  assert.ok(data.state.chatsA['entregador-ENT-8H2K-cmp-translog']);
});

test('login do entregador devolve entregas e conversas', async () => {
  const { status, data } = await loginDriver();
  assert.equal(status, 200);
  assert.equal(data.state.role, 'entregador');
  assert.equal(data.state.user.id, 'ENT-8H2K');
  assert.equal(data.state.user.companyId, 'cmp-translog');
  assert.equal(data.state.orders.length, 4);
  assert.ok(data.state.chatsA['entregador-ENT-8H2K-cmp-translog']);
  assert.ok(data.state.chats['entregador-ENT-8H2K-P-1042']);
});

test('credenciais inválidas são rejeitadas', async () => {
  const client = await loginClient('maria@email.com', 'CLI-0000');
  assert.equal(client.status, 401);

  const company = await loginCompany('12.345.678/0001-90', 'errada');
  assert.equal(company.status, 401);

  const driver = await loginDriver('carlos@translog.com.br', 'ENT-0000');
  assert.equal(driver.status, 401);
});

test('rotas protegidas exigem token', async () => {
  const { status } = await request('/api/data');
  assert.equal(status, 401);
});

test('empresa cria cliente com ID gerado e o cliente consegue entrar', async () => {
  const admin = await loginCompany();
  const created = await request('/api/clients', {
    method: 'POST',
    token: admin.data.token,
    body: { nome: 'Ana Teste', em: 'ana.teste@email.com' }
  });

  assert.equal(created.status, 201);
  assert.match(created.data.client.id, /^CLI-[A-Z0-9]{4}$/);
  assert.equal(created.data.state.clients.some((item) => item.id === created.data.client.id), true);

  const login = await loginClient('ana.teste@email.com', created.data.client.id);
  assert.equal(login.status, 200);
  assert.equal(login.data.state.user.nome, 'Ana Teste');
  assert.equal(login.data.state.orders.length, 0);

  const duplicated = await request('/api/clients', {
    method: 'POST',
    token: admin.data.token,
    body: { nome: 'Outra Ana', em: 'ana.teste@email.com' }
  });
  assert.equal(duplicated.status, 409);
});

test('empresa cria entregador com código gerado e ele consegue entrar', async () => {
  const admin = await loginCompany();
  const created = await request('/api/drivers', {
    method: 'POST',
    token: admin.data.token,
    body: { nome: 'Pedro Teste', em: 'pedro.teste@email.com' }
  });

  assert.equal(created.status, 201);
  assert.match(created.data.driver.id, /^ENT-[A-Z0-9]{4}$/);
  assert.equal(created.data.driver.empresa, 'TransLog Piauí');
  assert.equal(
    created.data.state.drivers.some((item) => item.id === created.data.driver.id),
    true
  );

  const login = await loginDriver('pedro.teste@email.com', created.data.driver.id);
  assert.equal(login.status, 200);
  assert.equal(login.data.state.user.nome, 'Pedro Teste');
  assert.equal(login.data.state.orders.length, 4);
});

test('somente o entregador atualiza o status do pedido', async () => {
  const driver = await loginDriver();
  const updated = await request('/api/orders/P-1043/status', {
    method: 'PATCH',
    token: driver.data.token,
    body: { st: 2 }
  });

  assert.equal(updated.status, 200);
  const order = updated.data.state.orders.find((item) => item.id === 'P-1043');
  assert.equal(order.st, 2);
  assert.equal(order.entregador, 'ENT-8H2K');

  const admin = await loginCompany();
  const adminUpdated = await request('/api/orders/P-1042/status', {
    method: 'PATCH',
    token: admin.data.token,
    body: { st: 0 }
  });
  assert.equal(adminUpdated.status, 403);

  const client = await loginClient();
  const clientUpdated = await request('/api/orders/P-1042/status', {
    method: 'PATCH',
    token: client.data.token,
    body: { st: 0 }
  });
  assert.equal(clientUpdated.status, 403);

  const adminData = await request('/api/data', { token: admin.data.token });
  const adminOrder = adminData.data.state.orders.find((item) => item.id === 'P-1043');
  assert.equal(adminOrder.st, 2);

  const clientData = await request('/api/data', { token: client.data.token });
  const clientOrder = clientData.data.state.orders.find((item) => item.id === 'P-1043');
  assert.equal(clientOrder.st, 2);
});

test('estoque permite editar, reabastecer e excluir', async () => {
  const admin = await loginCompany();

  const edited = await request('/api/stock/2', {
    method: 'PATCH',
    token: admin.data.token,
    body: { nome: 'Mochila de trilha Pro', cor: 'Preto', tam: 'M' }
  });
  assert.equal(edited.status, 200);
  assert.equal(
    edited.data.state.stock.find((item) => item.id === 2).nome,
    'Mochila de trilha Pro'
  );

  const restocked = await request('/api/stock/2/restock', {
    method: 'POST',
    token: admin.data.token
  });
  assert.equal(restocked.status, 200);
  assert.equal(restocked.data.state.stock.find((item) => item.id === 2).q, 13);

  const removed = await request('/api/stock/4', {
    method: 'DELETE',
    token: admin.data.token
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.state.stock.some((item) => item.id === 4), false);

  const client = await loginClient();
  const forbidden = await request('/api/stock/1', {
    method: 'PATCH',
    token: client.data.token,
    body: { nome: 'Teste' }
  });
  assert.equal(forbidden.status, 403);
});

test('cliente e empresa conversam na mesma conversa', async () => {
  const client = await loginClient();
  const sentByClient = await request('/api/chats/messages', {
    method: 'POST',
    token: client.data.token,
    body: {
      store: 'chats',
      key: 'empresa-cmp-translog',
      text: 'Mensagem da cliente para a empresa'
    }
  });
  assert.equal(sentByClient.status, 200);
  const clientLast =
    sentByClient.data.state.chats['empresa-cmp-translog'].msgs.at(-1);
  assert.equal(clientLast.me, 1);
  assert.equal(clientLast.t, 'Mensagem da cliente para a empresa');

  const admin = await loginCompany();
  const adminData = await request('/api/data', { token: admin.data.token });
  const adminLast = adminData.data.state.chatsA['cliente-CLI-7K2M'].msgs.at(-1);
  assert.equal(adminLast.me, 0);
  assert.equal(adminLast.t, 'Mensagem da cliente para a empresa');

  const reply = await request('/api/chats/messages', {
    method: 'POST',
    token: admin.data.token,
    body: {
      store: 'chatsA',
      key: 'cliente-CLI-7K2M',
      text: 'Resposta da empresa para a cliente'
    }
  });
  assert.equal(reply.status, 200);
  const adminReplyLast = reply.data.state.chatsA['cliente-CLI-7K2M'].msgs.at(-1);
  assert.equal(adminReplyLast.me, 1);

  const clientData = await request('/api/data', { token: client.data.token });
  const clientReplyLast =
    clientData.data.state.chats['empresa-cmp-translog'].msgs.at(-1);
  assert.equal(clientReplyLast.me, 0);
  assert.equal(clientReplyLast.t, 'Resposta da empresa para a cliente');
});

test('cliente e entregador conversam na mesma conversa', async () => {
  const client = await loginClient();
  const sentByClient = await request('/api/chats/messages', {
    method: 'POST',
    token: client.data.token,
    body: {
      store: 'chats',
      key: 'entregador-ENT-8H2K-P-1042',
      text: 'Mensagem da cliente para o entregador'
    }
  });
  assert.equal(sentByClient.status, 200);
  assert.equal(
    sentByClient.data.state.chats['entregador-ENT-8H2K-P-1042'].msgs.at(-1).me,
    1
  );

  const driver = await loginDriver();
  const driverData = await request('/api/data', { token: driver.data.token });
  const driverLast = driverData.data.state.chats['entregador-ENT-8H2K-P-1042'].msgs.at(-1);
  assert.equal(driverLast.me, 1);
  assert.equal(driverLast.t, 'Mensagem da cliente para o entregador');

  const reply = await request('/api/chats/messages', {
    method: 'POST',
    token: driver.data.token,
    body: {
      store: 'chats',
      key: 'entregador-ENT-8H2K-P-1042',
      text: 'Resposta do entregador para a cliente'
    }
  });
  assert.equal(reply.status, 200);
  assert.equal(
    reply.data.state.chats['entregador-ENT-8H2K-P-1042'].msgs.at(-1).me,
    0
  );

  const clientData = await request('/api/data', { token: client.data.token });
  const clientLast =
    clientData.data.state.chats['entregador-ENT-8H2K-P-1042'].msgs.at(-1);
  assert.equal(clientLast.me, 0);
  assert.equal(clientLast.t, 'Resposta do entregador para a cliente');
});

test('entregador e empresa conversam na mesma conversa', async () => {
  const driver = await loginDriver();
  const sent = await request('/api/chats/messages', {
    method: 'POST',
    token: driver.data.token,
    body: {
      store: 'chatsA',
      key: 'entregador-ENT-8H2K-cmp-translog',
      text: 'Mensagem do entregador para a empresa'
    }
  });
  assert.equal(sent.status, 200);
  assert.equal(
    sent.data.state.chatsA['entregador-ENT-8H2K-cmp-translog'].msgs.at(-1).me,
    0
  );

  const admin = await loginCompany();
  const adminData = await request('/api/data', { token: admin.data.token });
  const adminLast =
    adminData.data.state.chatsA['entregador-ENT-8H2K-cmp-translog'].msgs.at(-1);
  assert.equal(adminLast.me, 0);
  assert.equal(adminLast.t, 'Mensagem do entregador para a empresa');

  const reply = await request('/api/chats/messages', {
    method: 'POST',
    token: admin.data.token,
    body: {
      store: 'chatsA',
      key: 'entregador-ENT-8H2K-cmp-translog',
      text: 'Resposta da empresa para o entregador'
    }
  });
  assert.equal(reply.status, 200);
  assert.equal(
    reply.data.state.chatsA['entregador-ENT-8H2K-cmp-translog'].msgs.at(-1).me,
    1
  );

  const driverData = await request('/api/data', { token: driver.data.token });
  const driverLast =
    driverData.data.state.chatsA['entregador-ENT-8H2K-cmp-translog'].msgs.at(-1);
  assert.equal(driverLast.me, 1);
  assert.equal(driverLast.t, 'Resposta da empresa para o entregador');
});

test('preferência de alertas é persistida', async () => {
  const client = await loginClient();
  const updated = await request('/api/profile/alerts', {
    method: 'PATCH',
    token: client.data.token,
    body: { alerts: false }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.state.alerts, false);

  const data = await request('/api/data', { token: client.data.token });
  assert.equal(data.data.state.alerts, false);
});

test('empresa pode se cadastrar e entrar com o CNPJ', async () => {
  const registered = await request('/api/auth/register/company', {
    method: 'POST',
    body: {
      nome: 'Nova Log',
      abertura: '2020-01-01',
      cnpj: '11.222.333/0001-44',
      em: 'contato@novalog.com',
      pw: 'abcdef'
    }
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.state.role, 'admin');
  assert.equal(registered.data.state.orders.length, 0);
  assert.equal(registered.data.state.stock.length, 0);
  assert.equal(registered.data.state.clients.length, 0);
  assert.equal(registered.data.state.drivers.length, 0);

  const login = await loginCompany('11.222.333/0001-44', 'abcdef');
  assert.equal(login.status, 200);
  assert.equal(login.data.state.user.nome, 'Nova Log');

  const duplicated = await request('/api/auth/register/company', {
    method: 'POST',
    body: {
      nome: 'Nova Log 2',
      abertura: '2021-01-01',
      cnpj: '11.222.333/0001-44',
      em: 'contato@novalog2.com',
      pw: 'abcdef'
    }
  });
  assert.equal(duplicated.status, 409);

  const newCompany = await loginCompany('11.222.333/0001-44', 'abcdef');
  const forbidden = await request('/api/stock/1', {
    method: 'PATCH',
    token: newCompany.data.token,
    body: { nome: 'Tentativa' }
  });
  assert.equal(forbidden.status, 404);
});

test('logout invalida o token', async () => {
  const client = await loginClient();
  const logout = await request('/api/auth/logout', {
    method: 'POST',
    token: client.data.token
  });
  assert.equal(logout.status, 200);

  const data = await request('/api/data', { token: client.data.token });
  assert.equal(data.status, 401);
});
