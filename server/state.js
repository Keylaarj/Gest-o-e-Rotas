const publicCompany = (company) => ({
  id: company.id,
  nome: company.nome,
  abertura: company.abertura,
  cnpj: company.cnpj,
  em: company.em
});

const publicClient = (client) => ({
  id: client.id,
  nome: client.nome,
  em: client.em
});

const publicDriver = (driver) => ({
  id: driver.id,
  nome: driver.nome,
  em: driver.em,
  empresa: driver.empresa,
  empresaId: driver.empresaId
});

const getConversation = (db, id) => db.conversations[id] || { id, msgs: [] };

const messagesFor = (messages = [], owner) =>
  messages.map((message) => ({
    me: message.from === owner ? 1 : 0,
    t: message.t,
    h: message.h
  }));

const uiState = (view, alerts) => ({
  view,
  cur: { cliente: null, admin: null, entregador: null },
  from: null,
  sort: { k: 'nome', d: 1 },
  q: '',
  track: null,
  alerts
});

export function buildState(db, session) {
  if (!session) return null;
  if (session.role === 'cliente') return buildClientState(db, session);
  if (session.role === 'admin') return buildAdminState(db, session);
  if (session.role === 'entregador') return buildDriverState(db, session);
  return null;
}

function buildClientState(db, session) {
  const client = db.clients.find((item) => item.id === session.userId);
  if (!client) return null;

  const company = db.companies.find((item) => item.id === client.empresaId) || null;
  const orders = db.orders.filter((order) => order.cli === client.id);
  const chats = {};

  if (company) {
    const conversation = getConversation(
      db,
      `conv-empresa-${company.id}-cliente-${client.id}`
    );
    chats[`empresa-${company.id}`] = {
      nome: company.nome,
      outro: company.nome,
      msgs: messagesFor(conversation.msgs, 'cliente')
    };
  }

  orders.forEach((order) => {
    if (!order.entregador) return;
    const driver = db.drivers.find((item) => item.id === order.entregador);
    const conversation = getConversation(
      db,
      `conv-entregador-${order.entregador}-pedido-${order.id}`
    );
    chats[`entregador-${order.entregador}-${order.id}`] = {
      nome: `Entregador ${driver ? driver.nome : order.entregador} — Pedido ${order.id}`,
      outro: driver ? driver.nome : order.entregador,
      cli: client.id,
      msgs: messagesFor(conversation.msgs, 'cliente')
    };
  });

  const driverIds = [...new Set(orders.map((order) => order.entregador).filter(Boolean))];
  const drivers = driverIds
    .map((id) => db.drivers.find((item) => item.id === id))
    .filter(Boolean)
    .map(publicDriver);

  return {
    user: { nome: client.nome, em: client.em, id: client.id },
    role: 'cliente',
    orders,
    stock: [],
    chats,
    chatsA: {},
    clients: [],
    companies: company ? [publicCompany(company)] : [],
    drivers,
    ...uiState('pedidos', client.alerts !== false)
  };
}

function buildAdminState(db, session) {
  const company = db.companies.find((item) => item.id === session.companyId);
  if (!company) return null;

  const clients = db.clients.filter((item) => item.empresaId === company.id);
  const drivers = db.drivers.filter((item) => item.empresaId === company.id);
  const orders = db.orders.filter((item) => item.empresaId === company.id);
  const stock = db.stock.filter((item) => item.empresaId === company.id);
  const chatsA = {};

  clients.forEach((client) => {
    const conversation = getConversation(
      db,
      `conv-empresa-${company.id}-cliente-${client.id}`
    );
    chatsA[`cliente-${client.id}`] = {
      nome: `Cliente ${client.nome}`,
      outro: client.nome,
      msgs: messagesFor(conversation.msgs, 'empresa')
    };
  });

  drivers.forEach((driver) => {
    const conversation = getConversation(
      db,
      `conv-entregador-${driver.id}-empresa-${company.id}`
    );
    chatsA[`entregador-${driver.id}-${company.id}`] = {
      nome: `Entregador ${driver.nome} — ${company.nome}`,
      outro: driver.nome,
      msgs: messagesFor(conversation.msgs, 'empresa')
    };
  });

  return {
    user: { nome: company.nome, em: company.em, id: company.cnpj, companyId: company.id },
    role: 'admin',
    orders,
    stock,
    chats: {},
    chatsA,
    clients: clients.map(publicClient),
    companies: [publicCompany(company)],
    drivers: drivers.map(publicDriver),
    ...uiState('visao', company.alerts !== false)
  };
}

function buildDriverState(db, session) {
  const driver = db.drivers.find((item) => item.id === session.userId);
  if (!driver) return null;

  const company = db.companies.find((item) => item.id === driver.empresaId) || null;
  const clients = db.clients.filter((item) => item.empresaId === driver.empresaId);
  const drivers = db.drivers.filter((item) => item.empresaId === driver.empresaId);
  const orders = db.orders.filter((item) => item.empresaId === driver.empresaId);
  const chats = {};
  const chatsA = {};

  orders
    .filter((order) => order.entregador === driver.id)
    .forEach((order) => {
      const client = clients.find((item) => item.id === order.cli);
      const conversation = getConversation(
        db,
        `conv-entregador-${driver.id}-pedido-${order.id}`
      );
      chats[`entregador-${driver.id}-${order.id}`] = {
        nome: `Cliente ${client ? client.nome : order.cli} — Pedido ${order.id}`,
        outro: client ? client.nome : order.cli,
        sharedName: `Entregador ${driver.nome} — Pedido ${order.id}`,
        targetStore: 'chats',
        cli: order.cli,
        msgs: messagesFor(conversation.msgs, 'cliente')
      };
    });

  if (company) {
    const conversation = getConversation(
      db,
      `conv-entregador-${driver.id}-empresa-${company.id}`
    );
    chatsA[`entregador-${driver.id}-${company.id}`] = {
      nome: `Empresa: ${company.nome}`,
      outro: company.nome,
      sharedName: `Entregador ${driver.nome} — ${company.nome}`,
      targetStore: 'chatsA',
      msgs: messagesFor(conversation.msgs, 'empresa')
    };
  }

  return {
    user: {
      nome: driver.nome,
      em: driver.em,
      id: driver.id,
      companyId: driver.empresaId
    },
    role: 'entregador',
    orders,
    stock: [],
    chats,
    chatsA,
    clients: clients.map(publicClient),
    companies: company ? [publicCompany(company)] : [],
    drivers: drivers.map(publicDriver),
    ...uiState('entregas', driver.alerts !== false)
  };
}
