import { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

/* Dados */

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

const DISTS = {
  translog: 'TransLog Piauí',
  rotanorte: 'Rota Norte Distribuidora',
  express: 'Express Teresina'
};

const ST = ['Em preparação', 'A caminho', 'Entregue'];
const SC = ['prep', 'way', 'ok'];

const LOGO = (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M4 24 L16 6 L28 24 L20 24 L16 17 L12 24Z" fill="#00A847" />
  </svg>
);

const Shirt = ({ label }) => (
  <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={label}>
    <rect x="16" y="40" width="64" height="32" rx="12" fill="#8A949E" />
    <path d="M20 56 Q48 20 76 56" fill="none" stroke="#008A3B" strokeWidth="8" strokeLinecap="round" />
  </svg>
);

const Badge = ({ index }) => (
  <span className={`badge st-${SC[index]}`}>
    <i aria-hidden="true"></i>
    {ST[index]}
  </span>
);

const INITIAL_STATE = {
  user: null,
  role: 'cliente',
  view: '',
  orders: [
    { id: 'P-1042', prod: 'Tênis de corrida', cor: 'Verde', tam: '41', qtd: 1, st: 1, cli: 'CLI-7K2M', dk: 'translog' },
    { id: 'P-1043', prod: 'Mochila de trilha', cor: 'Preto', tam: 'M', qtd: 2, st: 0, cli: 'CLI-7K2M', dk: 'rotanorte' },
    { id: 'P-1031', prod: 'Jaqueta corta-vento', cor: 'Prata', tam: 'G', qtd: 1, st: 2, cli: 'CLI-7K2M', dk: 'express' },
    { id: 'P-1044', prod: 'Boné esportivo', cor: 'Verde', tam: 'Único', qtd: 3, st: 1, cli: 'CLI-9X4Q', dk: 'translog' }
  ],
  stock: [
    { id: 1, nome: 'Tênis de corrida', cor: 'Verde', tam: '41', q: 12, min: 5 },
    { id: 2, nome: 'Mochila de trilha', cor: 'Preto', tam: 'M', q: 3, min: 5 },
    { id: 3, nome: 'Jaqueta corta-vento', cor: 'Prata', tam: 'G', q: 8, min: 4 },
    { id: 4, nome: 'Boné esportivo', cor: 'Verde', tam: 'Único', q: 2, min: 4 }
  ],
  chats: {
    translog: { nome: 'TransLog Piauí', msgs: [{ me: 0, t: 'Olá! Seu pedido P-1042 saiu para entrega e deve chegar hoje.', h: '09:12' }] },
    rotanorte: { nome: 'Rota Norte Distribuidora', msgs: [{ me: 0, t: 'Seu pedido P-1043 está em separação. Previsão de saída amanhã cedo.', h: '08:40' }] },
    express: { nome: 'Express Teresina', msgs: [{ me: 0, t: 'Pedido P-1031 entregue. Obrigado pela preferência!', h: 'Ontem' }] }
  },
  chatsA: {
    c1: { nome: 'Cliente CLI-7K2M', msgs: [{ me: 0, t: 'Bom dia! Posso mudar o endereço de entrega do P-1042?', h: '09:30' }] },
    c2: { nome: 'Cliente CLI-9X4Q', msgs: [{ me: 0, t: 'O boné veio na cor errada. Como faço a troca?', h: '10:05' }] }
  },
  cur: { cliente: null, admin: null },
  from: null,
  sort: { k: 'nome', d: 1 },
  q: '',
  track: null,
  alerts: true
};

const NAV = {
  cliente: [
    ['pedidos', 'Meus pedidos'],
    ['chat', 'Mensagens'],
    ['perfil', 'Perfil']
  ],
  admin: [
    ['visao', 'Visão geral'],
    ['estoque', 'Estoque'],
    ['pedidosA', 'Pedidos'],
    ['chatA', 'Atendimento']
  ]
};

/* COMPONENTES PRINCIPAIS */

export default function App() {
  const [S, setS] = useState(INITIAL_STATE);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalConfig, setModalConfig] = useState(null);

  const addToast = (msg) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const changeView = (newView) => {
    setLoading(true);
    setTimeout(() => {
      setS((prev) => ({
        ...prev,
        view: newView,
        cur: { ...prev.cur, [prev.role]: null },
        from: null
      }));
      setLoading(false);
    }, 400);
  };

  if (!S.user) {
    return <AuthScreen S={S} setS={setS} addToast={addToast} />;
  }

  return (
    <div id="app">
      <div id="toast">
        {toasts.map((t) => (
          <div key={t.id}>{t.msg}</div>
        ))}
      </div>

      <header className="top">
        <div className="logo">
          {LOGO}
          <span>Gestão e <b>Rotas</b></span>
        </div>
        <nav aria-label="Navegação Principal">
          {NAV[S.role].map(([k, l]) => (
            <button
              key={k}
              aria-current={S.view === k || (S.view === 'rastreio' && k === 'pedidos') ? 'page' : undefined}
              onClick={() => changeView(k)}
            >
              {l}
            </button>
          ))}
        </nav>
        <button className="btn" onClick={() => setS((prev) => ({ ...prev, user: null }))}>
          Sair
        </button>
      </header>

      <main id="main">
        <div id="view" aria-busy={loading ? 'true' : undefined}>
          {loading ? (
            <div className="grid c3">
              <div className="card"><div className="sk b"></div><div className="sk"></div><div className="sk"></div></div>
              <div className="card"><div className="sk b"></div><div className="sk"></div><div className="sk"></div></div>
              <div className="card"><div className="sk b"></div><div className="sk"></div><div className="sk"></div></div>
            </div>
          ) : (
            <ViewContent
              S={S}
              setS={setS}
              addToast={addToast}
              changeView={changeView}
              setModalConfig={setModalConfig}
              setLoading={setLoading}
            />
          )}
        </div>
      </main>

      {modalConfig && (
        <Modal config={modalConfig} onClose={() => setModalConfig(null)} />
      )}
    </div>
  );
}

/* TELA DE AUTENTICAÇÃO*/

function AuthScreen({ S, setS, addToast }) {
  const [mode, setMode] = useState('in');
  const [form, setForm] = useState({ nome: '', em: '', pw: '' });
  const [errors, setErrors] = useState({});

  const validate = (field, val) => {
    let ok = true;
    let msg = '';
    if (field === 'nome') {
      ok = val.trim().split(/\s+/).length > 1;
      msg = 'Informe nome e sobrenome.';
    } else if (field === 'em') {
      ok = /^\S+@\S+\.\S+$/.test(val);
      msg = 'Digite um e-mail válido.';
    } else if (field === 'pw') {
      ok = val.length >= 6;
      msg = 'A senha precisa ter ao menos 6 caracteres.';
    }
    setErrors((prev) => ({ ...prev, [field]: ok ? '' : msg }));
    return ok;
  };

  const handleChange = (field, val) => {
    setForm((prev) => ({ ...prev, [field]: val }));
    validate(field, val);
  };

  const handleSubmit = () => {
    const isSignUp = mode === 'up';
    const fieldsToValidate = isSignUp ? ['nome', 'em', 'pw'] : ['em', 'pw'];
    let valid = true;

    fieldsToValidate.forEach((f) => {
      if (!validate(f, form[f])) valid = false;
    });

    if (!valid) return;

    const nome = isSignUp ? form.nome : form.em.split('@')[0];
    const userId = S.role === 'cliente' ? 'CLI-7K2M' : 'ADM-001';
    const initialView = S.role === 'cliente' ? 'pedidos' : 'visao';

    setS((prev) => ({
      ...prev,
      user: { nome, em: form.em, id: userId },
      view: initialView
    }));

    if (isSignUp && S.role === 'cliente') {
      addToast(`Conta criada. ID ${userId} gerado com sucesso.`);
    }
  };

  return (
    <div id="app" className="dark">
      <main className="auth">
        <section className="auth-box">
          <div className="logo">
            {LOGO}
            <span>Gestão e <b>Rotas</b></span>
          </div>
          <h1>Entrar ou criar conta</h1>

          <div className="seg">
            <button
              type="button"
              className={S.role === 'cliente' ? 'active' : ''}
              onClick={() => setS((prev) => ({ ...prev, role: 'cliente' }))}
            >
              Cliente
            </button>
            <button
              type="button"
              className={S.role === 'admin' ? 'active' : ''}
              onClick={() => setS((prev) => ({ ...prev, role: 'admin' }))}
            >
              Distribuidora / Admin
            </button>
          </div>

          <div className="row" style={{ marginBottom: '16px' }}>
            <label>
              <input
                type="radio"
                name="m"
                checked={mode === 'in'}
                onChange={() => setMode('in')}
              />{' '}
              Já tenho conta
            </label>
            <label>
              <input
                type="radio"
                name="m"
                checked={mode === 'up'}
                onChange={() => setMode('up')}
              />{' '}
              Quero me cadastrar
            </label>
          </div>

          {mode === 'up' && (
            <label className="field">
              <span className="l">Nome completo</span>
              <input
                value={form.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                className={errors.nome === '' && form.nome ? 'ok' : ''}
              />
              {errors.nome && <div className="hint err">{errors.nome}</div>}
            </label>
          )}

          <label className="field">
            <span className="l">E-mail</span>
            <input
              type="email"
              value={form.em}
              onChange={(e) => handleChange('em', e.target.value)}
              className={errors.em === '' && form.em ? 'ok' : ''}
            />
            {errors.em && <div className="hint err">{errors.em}</div>}
          </label>

          <label className="field">
            <span className="l">Senha</span>
            <input
              type="password"
              value={form.pw}
              onChange={(e) => handleChange('pw', e.target.value)}
              className={errors.pw === '' && form.pw ? 'ok' : ''}
            />
            {errors.pw && <div className="hint err">{errors.pw}</div>}
          </label>

          <button className="btn pri" style={{ width: '100%' }} onClick={handleSubmit}>
            {mode === 'up' ? 'Criar conta' : 'Entrar'}
          </button>
        </section>
      </main>
    </div>
  );
}

/* ROTEADOR DE CONTEUDO*/

function ViewContent({ S, setS, addToast, changeView, setModalConfig, setLoading }) {
  const mine = S.orders.filter((o) => o.cli === S.user.id);

  const simulateAsync = (action) => {
    setLoading(true);
    setTimeout(() => {
      action();
      setLoading(false);
    }, 400);
  };

  switch (S.view) {
    case 'pedidos':
      return (
        <>
          <h1>Meus pedidos</h1>
          <p>Acompanhe cada compra e rastreie a entrega.</p>
          <div className="grid c3">
            {mine.map((o) => (
              <article key={o.id} className="card">
                <div className="ph">
                  <Shirt label={`${o.prod}, cor ${o.cor.toLowerCase()}, tamanho ${o.tam}`} />
                </div>
                <h2>{o.prod}</h2>
                <Badge index={o.st} />
                <dl className="spec">
                  <dt>Produto</dt><dd>{o.prod}</dd>
                  <dt>Cor</dt><dd>{o.cor}</dd>
                  <dt>Tamanho</dt><dd>{o.tam}</dd>
                  <dt>Quantidade</dt><dd>{o.qtd}</dd>
                </dl>
                <button
                  className="btn pri"
                  style={{ width: '100%' }}
                  onClick={() => setS((prev) => ({ ...prev, track: o.id, view: 'rastreio' }))}
                >
                  Rastrear Encomenda
                </button>
              </article>
            ))}
          </div>
        </>
      );

    case 'rastreio': {
      const o = S.orders.find((x) => x.id === S.track) || mine[0] || S.orders[0];
      const st = typeof o?.st === 'number' && o.st >= 0 && o.st <= 2 ? o.st : 0;

      // Coordenadas das etapas (exemplo Teresina - PI)
      const coords = [
        [-5.08921, -42.8016], // Status 0: Centro de distribuição
        [-5.08551, -42.8055], // Status 1: A caminho
        [-5.08012, -42.8123]  // Status 2: Entregue
      ];
      const center = coords[st];

      return (
        <>
          <button className="btn sm" style={{ marginBottom: '16px' }} onClick={() => changeView('pedidos')}>
            Voltar para meus pedidos
          </button>
          <h1>Rastreamento do pedido {o.id}</h1>
          <p>{o.prod}, {o.cor}, tamanho {o.tam}. Distribuidora: <strong>{DISTS[o.dk]}</strong>.</p>
          <p>
            <button
              className="btn pri"
              onClick={() => {
                setS((prev) => ({
                  ...prev,
                  cur: { ...prev.cur, cliente: o.dk },
                  from: 'rastreio',
                  view: 'chat'
                }));
              }}
            >
              Falar com {DISTS[o.dk]}
            </button>
          </p>

          <ol className="steps">
            {ST.map((s, i) => (
              <li key={i} className={i <= st ? 'done' : ''}>
                <span className="dot">{i < st ? '✓' : i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>

          <div className="two">
            {/* NOVO MAPA LEAFLET (Substituiu o SVG antigo) */}
            <div className="map" style={{ width: '100%', height: '240px', borderRadius: '8px', overflow: 'hidden' }}>
              <MapContainer
                key={st}
                center={center}
                zoom={14}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={center}>
                  <Popup>{ST[st]}</Popup>
                </Marker>
              </MapContainer>
            </div>

            <div>
              <h2>Localização em texto</h2>
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>Item</th><th>Informação</th></tr>
                  </thead>
                  <tbody>
                    <tr><th>Status</th><td>{ST[st]}</td></tr>
                    <tr><th>Local atual</th><td>{['Centro de distribuição', 'Av. Frei Serafim, Centro', 'Endereço do cliente'][st]}</td></tr>
                    <tr><th>Previsão</th><td>{['Amanhã, 14h', 'Hoje, 16h', 'Entregue'][st]}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      );
    }
    case 'chat':
    case 'chatA':
      return (
        <ChatUI
          S={S}
          setS={setS}
          addToast={addToast}
          isAdmin={S.view === 'chatA'}
          ph={S.view === 'chatA' ? 'Responder chamado' : 'Escreva para a distribuidora'}
        />
      );

    case 'perfil':
      return (
        <>
          <h1>Perfil</h1>
          <div className="two" style={{ gridTemplateColumns: '1fr' }}>
            <section className="card">
              <h2>Dados pessoais</h2>
              <dl className="spec">
                <dt>Nome</dt><dd>{esc(S.user.nome)}</dd>
                <dt>E-mail</dt><dd>{esc(S.user.em)}</dd>
                <dt>ID do cliente</dt><dd>{S.user.id}</dd>
              </dl>
            </section>
            <section className="card">
              <h2>Histórico de compras</h2>
              <ul>
                {mine.map((o) => (
                  <li key={o.id}>{o.id}: {o.prod} ({o.qtd}x), {ST[o.st].toLowerCase()}</li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2>Preferências de alerta</h2>
              <label style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={S.alerts}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setS((prev) => ({ ...prev, alerts: checked }));
                    addToast(checked ? 'Alertas ativados.' : 'Alertas desativados.');
                  }}
                />
                Avisar quando o status do pedido mudar
              </label>
            </section>
          </div>
        </>
      );

    case 'visao': {
      const low = S.stock.filter((s) => s.q <= s.min);
      return (
        <>
          <h1>Visão geral</h1>
          {S.alerts && low.length > 0 && (
            <div className="banner">
              <div>
                <h2>Estoque crítico</h2>
                <p>{low.map((l) => `${l.nome} (${l.q} un.)`).join(', ')} no mínimo ou abaixo.</p>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => changeView('estoque')}>Ver estoque</button>
                <button className="btn sm" onClick={() => setS((prev) => ({ ...prev, alerts: false }))}>Dispensar</button>
              </div>
            </div>
          )}
          <div className="grid c3">
            <div className="card metric blu">
              <div className="n">{S.orders.filter((o) => o.st === 1).length}</div>
              Pedidos a caminho
            </div>
            <div className="card metric">
              <div className="n">{S.orders.filter((o) => o.st === 2).length}</div>
              Entregas efetuadas hoje
            </div>
            <div className="card metric red">
              <div className="n">{low.length}</div>
              Alertas de estoque crítico
            </div>
          </div>
        </>
      );
    }

    case 'estoque': {
      const { k, d } = S.sort;
      const q = S.q.toLowerCase();
      const rows = S.stock
        .filter((s) => [s.nome, s.cor, s.tam].join(' ').toLowerCase().includes(q))
        .sort((a, b) => (a[k] > b[k] ? 1 : -1) * d);

      return (
        <>
          <h1>Gestão de estoque</h1>
          <div className="bar">
            <label className="field">
              <span className="l">Buscar produto</span>
              <input
                type="search"
                value={S.q}
                onChange={(e) => setS((prev) => ({ ...prev, q: e.target.value }))}
              />
            </label>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cor</th>
                  <th>Tamanho</th>
                  <th>Quantidade</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nome}</td>
                    <td>{s.cor}</td>
                    <td>{s.tam}</td>
                    <td>{s.q}</td>
                    <td>
                      <span className={`badge ${s.q <= s.min ? 'st-err' : 'st-ok'}`}>
                        {s.q <= s.min ? 'Estoque mínimo' : 'Estoque OK'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={() => {
                          setModalConfig({
                            title: 'Editar produto',
                            type: 'edit',
                            data: s,
                            onConfirm: (data) => {
                              setS((prev) => ({
                                ...prev,
       stock: prev.stock.map((x) => (x.id === s.id ? { ...x, ...data } : x))
                              }));
                              simulateAsync(() => addToast('Especificações salvas.'));
                            }
                          });
                        }}
                      >
                        Editar
                      </button>{' '}
                      <button
                        className="btn sm pri"
                        onClick={() => {
                          setS((prev) => ({
                            ...prev,
                            stock: prev.stock.map((x) => (x.id === s.id ? { ...x, q: x.q + 10 } : x))
                          }));
                          simulateAsync(() => addToast(`${s.nome} reabastecido.`));
                        }}
                      >
                        Reabastecer
                      </button>{' '}
                      <button
                        className="btn sm dng"
                        onClick={() => {
                          setModalConfig({
                            title: 'Excluir produto?',
                            message: `${s.nome} será removido do estoque.`,
                            okLbl: 'Excluir',
                            danger: true,
                            onConfirm: () => {
                              setS((prev) => ({
                                ...prev,
                                stock: prev.stock.filter((x) => x.id !== s.id)
                              }));
                              simulateAsync(() => addToast('Produto excluído.'));
                            }
                          });
                        }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    case 'pedidosA':
      return (
        <>
          <h1>Pedidos e status</h1>
          <div className="grid c3">
            {S.orders.map((o) => (
              <article key={o.id} className="card">
                <h2>{o.id}: {o.prod}</h2>
                <Badge index={o.st} />
                <p>{o.cor}, tam. {o.tam}, {o.qtd} un.<br />Cliente {o.cli}</p>
                <label className="field">
                  <span className="l">Atualizar status</span>
                  <select
                    value={o.st}
                    onChange={(e) => {
                      const newSt = Number(e.target.value);
                      setS((prev) => ({
                        ...prev,
                        orders: prev.orders.map((x) => (x.id === o.id ? { ...x, st: newSt } : x))
                      }));
                      simulateAsync(() => addToast(`Pedido ${o.id} atualizado.`));
                    }}
                  >
                    {ST.map((s, i) => (
                      <option key={i} value={i}>{s}</option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        </>
      );

    default:
      return null;
  }
}

/* CHAT */

function ChatUI({ S, setS, addToast, isAdmin, ph }) {
  const [inputMsg, setInputMsg] = useState('');
  const logRef = useRef(null);

  const store = isAdmin ? S.chatsA : S.chats;
  const k = S.cur[S.role];

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 1e5;
  }, [store, k]);

  if (!k) {
    return (
      <>
        <h1>Mensagens</h1>
        <ul className="clist">
          {Object.entries(store).map(([id, x]) => (
            <li key={id}>
              <button
                onClick={() => setS((prev) => ({ ...prev, cur: { ...prev.cur, [prev.role]: id } }))}
              >
                <strong>{x.nome}</strong>
                <span>{esc(x.msgs[x.msgs.length - 1].t)}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const c = store[k];

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const h = new Date().toTimeString().slice(0, 5);
    const newMsg = { me: 1, t: inputMsg.trim(), h };
    const targetStore = isAdmin ? 'chatsA' : 'chats';

    setS((prev) => ({
      ...prev,
      [targetStore]: {
        ...prev[targetStore],
        [k]: {
          ...prev[targetStore][k],
          msgs: [...prev[targetStore][k].msgs, newMsg]
        }
      }
    }));

    setInputMsg('');
    addToast('Mensagem enviada.');
  };

  return (
    <>
      <button
        className="btn sm"
        style={{ marginBottom: '16px' }}
        onClick={() => setS((prev) => ({ ...prev, cur: { ...prev.cur, [prev.role]: null } }))}
      >
        Todas as conversas
      </button>

      <h1>{c.nome}</h1>

      <div className="chat" ref={logRef}>
        {c.msgs.map((m, idx) => (
          <div key={idx} className={`msg ${m.me ? 'me' : ''}`}>
            {esc(m.t)}
            <small>{m.me ? 'Você' : c.nome}, {m.h}</small>
          </div>
        ))}
      </div>

      <form className="row" onSubmit={handleSend}>
        <input
          placeholder={ph}
          value={inputMsg}
          onChange={(e) => setInputMsg(e.target.value)}
        />
        <button className="btn pri">Enviar</button>
      </form>
    </>
  );
}

/* MODAL */

function Modal({ config, onClose }) {
  const { title, message, okLbl = 'Salvar', danger, type, data, onConfirm } = config;
  const [formData, setFormData] = useState({
    nome: data?.nome || '',
    cor: data?.cor || '',
    tam: data?.tam || ''
  });

  return (
    <div id="mdl">
      <div className="ov">
        <div className="modal">
          <h2>{title}</h2>
          {type === 'edit' ? (
            <>
              <label className="field">
                <span className="l">Nome</span>
                <input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="l">Cor</span>
                <input
                  value={formData.cor}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="l">Tamanho</span>
                <input
                  value={formData.tam}
                  onChange={(e) => setFormData({ ...formData, tam: e.target.value })}
                />
              </label>
            </>
          ) : (
            <p>{message}</p>
          )}

          <div className="row">
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button
              className={`btn ${danger ? 'dng' : 'pri'}`}
              onClick={() => {
                onConfirm(formData);
                onClose();
              }}
            >
              {okLbl}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}