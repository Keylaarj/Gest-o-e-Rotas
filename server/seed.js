import { hashPassword } from './auth.js';

export function createSeed() {
  const companyId = 'cmp-translog';
  const { salt, hash } = hashPassword('123456');

  return {
    companies: [
      {
        id: companyId,
        nome: 'TransLog Piauí',
        abertura: '2015-03-10',
        cnpj: '12.345.678/0001-90',
        em: 'contato@translog.com.br',
        senhaSalt: salt,
        senhaHash: hash,
        alerts: true
      }
    ],
    clients: [
      { id: 'CLI-7K2M', nome: 'Maria Silva', em: 'maria@email.com', empresaId: companyId, alerts: true },
      { id: 'CLI-9X4Q', nome: 'João Souza', em: 'joao@email.com', empresaId: companyId, alerts: true }
    ],
    drivers: [
      {
        id: 'ENT-8H2K',
        nome: 'Carlos Lima',
        em: 'carlos@translog.com.br',
        empresa: 'TransLog Piauí',
        empresaId: companyId,
        alerts: true
      }
    ],
    orders: [
      { id: 'P-1042', prod: 'Tênis de corrida', cor: 'Verde', tam: '41', qtd: 1, st: 1, cli: 'CLI-7K2M', dk: 'translog', entregador: 'ENT-8H2K', empresaId: companyId },
      { id: 'P-1043', prod: 'Mochila de trilha', cor: 'Preto', tam: 'M', qtd: 2, st: 0, cli: 'CLI-7K2M', dk: 'rotanorte', entregador: 'ENT-8H2K', empresaId: companyId },
      { id: 'P-1031', prod: 'Jaqueta corta-vento', cor: 'Prata', tam: 'G', qtd: 1, st: 2, cli: 'CLI-7K2M', dk: 'express', entregador: 'ENT-8H2K', empresaId: companyId },
      { id: 'P-1044', prod: 'Boné esportivo', cor: 'Verde', tam: 'Único', qtd: 3, st: 1, cli: 'CLI-9X4Q', dk: 'translog', entregador: 'ENT-8H2K', empresaId: companyId }
    ],
    stock: [
      { id: 1, nome: 'Tênis de corrida', cor: 'Verde', tam: '41', q: 12, min: 5, empresaId: companyId },
      { id: 2, nome: 'Mochila de trilha', cor: 'Preto', tam: 'M', q: 3, min: 5, empresaId: companyId },
      { id: 3, nome: 'Jaqueta corta-vento', cor: 'Prata', tam: 'G', q: 8, min: 4, empresaId: companyId },
      { id: 4, nome: 'Boné esportivo', cor: 'Verde', tam: 'Único', q: 2, min: 4, empresaId: companyId }
    ],
    conversations: {
      [`conv-empresa-${companyId}-cliente-CLI-7K2M`]: {
        id: `conv-empresa-${companyId}-cliente-CLI-7K2M`,
        kind: 'empresa-cliente',
        companyId,
        clientId: 'CLI-7K2M',
        msgs: [
          { from: 'empresa', t: 'Pedido P-1031 entregue. Obrigado pela preferência!', h: 'Ontem' },
          { from: 'empresa', t: 'Seu pedido P-1043 está em separação. Previsão de saída amanhã cedo.', h: '08:40' },
          { from: 'empresa', t: 'Olá! Seu pedido P-1042 saiu para entrega e deve chegar hoje.', h: '09:12' },
          { from: 'cliente', t: 'Bom dia! Posso mudar o endereço de entrega do P-1042?', h: '09:30' }
        ]
      },
      [`conv-empresa-${companyId}-cliente-CLI-9X4Q`]: {
        id: `conv-empresa-${companyId}-cliente-CLI-9X4Q`,
        kind: 'empresa-cliente',
        companyId,
        clientId: 'CLI-9X4Q',
        msgs: [{ from: 'cliente', t: 'O boné veio na cor errada. Como faço a troca?', h: '10:05' }]
      },
      [`conv-entregador-ENT-8H2K-empresa-${companyId}`]: {
        id: `conv-entregador-ENT-8H2K-empresa-${companyId}`,
        kind: 'entregador-empresa',
        driverId: 'ENT-8H2K',
        companyId,
        msgs: [
          { from: 'entregador', t: 'Pedido entregue. Segue o comprovante.', h: 'Ontem' },
          { from: 'entregador', t: 'Estou a caminho da coleta.', h: '08:35' },
          { from: 'entregador', t: 'Cheguei ao centro de distribuição e já peguei os pedidos.', h: '08:50' }
        ]
      },
      'conv-entregador-ENT-8H2K-pedido-P-1042': {
        id: 'conv-entregador-ENT-8H2K-pedido-P-1042',
        kind: 'cliente-entregador',
        driverId: 'ENT-8H2K',
        clientId: 'CLI-7K2M',
        orderId: 'P-1042',
        msgs: [{ from: 'entregador', t: 'Olá! Sou o entregador do seu pedido P-1042. Estou a caminho.', h: '09:20' }]
      },
      'conv-entregador-ENT-8H2K-pedido-P-1043': {
        id: 'conv-entregador-ENT-8H2K-pedido-P-1043',
        kind: 'cliente-entregador',
        driverId: 'ENT-8H2K',
        clientId: 'CLI-7K2M',
        orderId: 'P-1043',
        msgs: [{ from: 'entregador', t: 'Bom dia! Vou coletar seu pedido ainda hoje.', h: '08:45' }]
      },
      'conv-entregador-ENT-8H2K-pedido-P-1031': {
        id: 'conv-entregador-ENT-8H2K-pedido-P-1031',
        kind: 'cliente-entregador',
        driverId: 'ENT-8H2K',
        clientId: 'CLI-7K2M',
        orderId: 'P-1031',
        msgs: [{ from: 'entregador', t: 'Seu pedido foi entregue. Qualquer dúvida, estou à disposição.', h: 'Ontem' }]
      }
    }
  };
}
