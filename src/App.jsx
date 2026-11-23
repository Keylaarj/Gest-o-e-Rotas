import { useState, useEffect, useRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import { api } from './api.js';

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
)

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
  orders: [],
  stock: [],
  chats: {},
  chatsA: {},
  clients: [],
  companies: [],
  drivers: [],
  cur: { cliente: null, admin: null, entregador: null },
  from: null,
  sort: { k: 'nome', d: 1 },
  q: '',
  track: null,
  alerts: true
};

const emptyState = () => ({
  ...INITIAL_STATE,
  cur: { ...INITIAL_STATE.cur },
  sort: { ...INITIAL_STATE.sort }
});

const NAV = {
  cliente: [
    ['pedidos', 'Meus pedidos'],
    ['chat', 'Mensagens'],
    ['perfil', 'Perfil']
  ],
  entregador: [
    ['entregas', 'Entregas'],
    ['chatE', 'Mensagens'],
    ['perfil', 'Perfil']
  ],
  admin: [
    ['visao', 'Visão geral'],
    ['estoque', 'Estoque'],
    ['pedidosA', 'Pedidos'],
    ['clientes', 'Clientes'],
    ['entregadores', 'Entregadores'],
    ['chatA', 'Atendimento']
  ]
};

/* COMPONENTES PRINCIPAIS */

export default function App() {
  const [S, setS] = useState(emptyState);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalConfig, setModalConfig] = useState(null);
  const [booting, setBooting] = useState(() => api.hasToken());

  const addToast = (msg) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const applyServerState = useCallback((serverState) => {
    if (!serverState) return;
    setS((prev) => ({
      ...prev,
      user: serverState.user,
      role: serverState.role,
      orders: serverState.orders,
      stock: serverState.stock,
      chats: serverState.chats,
      chatsA: serverState.chatsA,
      clients: serverState.clients,
      companies: serverState.companies,
      drivers: serverState.drivers,
      alerts: serverState.alerts
    }));
  }, []);

  const resetSession = useCallback(() => {
    api.clearToken();
    setS(emptyState());
    setLoading(false);
    setModalConfig(null);
  }, []);

  const handleAuth = useCallback(({ token, state }) => {
    api.setToken(token);
    setS({ ...emptyState(), ...state });
  }, []);

  const handleLogout = async (notify = true) => {
    try {
      await api.logout();
    } catch {
      // a sessão local será encerrada de qualquer forma
    }
    resetSession();
    if (notify) addToast('Sessão encerrada.');
  };

  useEffect(() => {
    if (!api.hasToken()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { state } = await api.getSession();
        if (!cancelled) setS({ ...emptyState(), ...state });
      } catch {
        if (!cancelled) resetSession();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resetSession]);

  useEffect(() => {
    const onUnauthorized = () => resetSession();
    window.addEventListener('gestao-rotas:unauthorized', onUnauthorized);
    return () => window.removeEventListener('gestao-rotas:unauthorized', onUnauthorized);
  }, [resetSession]);

  const currentUserId = S.user?.id;

  useEffect(() => {
    if (!currentUserId) return undefined;
    let cancelled = false;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const { state } = await api.getData();
        if (!cancelled) applyServerState(state);
      } catch (err) {
        if (err.status === 401 && !cancelled) resetSession();
      } finally {
        busy = false;
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentUserId, S.role, applyServerState, resetSession]);

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
    }, 250);
  };

  if (booting) {
    return (
      <div id="app" className="dark">
        <main className="auth">
          <section className="auth-box boot">
            <div className="logo">
              {LOGO}
              <span>Gestão e <b>Rotas</b></span>
            </div>
            <p>Carregando…</p>
          </section>
        </main>
      </div>
    );
  }

  if (!S.user) {
    return <AuthScreen onAuth={handleAuth} addToast={addToast} />;
  }

  const trackingParent = { cliente: 'pedidos', admin: 'pedidosA', entregador: 'entregas' }[S.role];

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
              aria-current={S.view === k || (S.view === 'rastreio' && k === trackingParent) ? 'page' : undefined}
              onClick={() => changeView(k)}
            >
              {l}
            </button>
          ))}
        </nav>
        <button className="btn" onClick={() => handleLogout()}>
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
              applyServerState={applyServerState}
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

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const onlyDigits = (v) => v.replace(/\D/g, '');

const formatCnpj = (value) => {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length > 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
};

function AuthScreen({ onAuth, addToast }) {
  const [portal, setPortal] = useState('cliente');
  const [empresaMode, setEmpresaMode] = useState('in');
  const [clienteForm, setClienteForm] = useState({ em: '', pw: '' });
  const [empresaForm, setEmpresaForm] = useState({
    nome: '',
    abertura: '',
    cnpj: '',
    em: '',
    pw: ''
  });
  const [entregadorForm, setEntregadorForm] = useState({ em: '', pw: '' });
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchPortal = () => {
    setPortal((prev) => {
      if (prev === 'cliente') return 'empresa';
      if (prev === 'empresa') return 'cliente';
      return 'empresa';
    });
    setErrors({});
    setLoginError('');
  };

  const changeCliente = (field, val) => {
    setClienteForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setLoginError('');
  };

  const changeEmpresa = (field, val) => {
    setEmpresaForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setLoginError('');
  };

  const changeEntregador = (field, val) => {
    setEntregadorForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setLoginError('');
  };

  const loginCliente = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!EMAIL_RE.test(clienteForm.em.trim())) errs.em = 'Digite um e-mail válido.';
    if (!clienteForm.pw.trim()) errs.pw = 'Informe a senha (ID fornecido pela empresa).';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setLoginError('');
    try {
      const data = await api.loginClient(clienteForm.em.trim(), clienteForm.pw.trim());
      onAuth(data);
    } catch (err) {
      setLoginError(err.message || 'E-mail ou senha inválidos.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginEntregador = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!EMAIL_RE.test(entregadorForm.em.trim())) errs.em = 'Digite um e-mail válido.';
    if (!entregadorForm.pw.trim()) errs.pw = 'Informe o código de acesso.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setLoginError('');
    try {
      const data = await api.loginDriver(entregadorForm.em.trim(), entregadorForm.pw.trim());
      onAuth(data);
    } catch (err) {
      setLoginError(err.message || 'E-mail ou código inválidos.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEmpresa = async (e) => {
    e.preventDefault();
    const isSignUp = empresaMode === 'up';
    const cnpjDigits = onlyDigits(empresaForm.cnpj);
    const errs = {};

    if (isSignUp && empresaForm.nome.trim().length < 2) {
      errs.nome = 'Informe o nome da empresa.';
    }
    if (isSignUp && !empresaForm.abertura) {
      errs.abertura = 'Informe a data de abertura.';
    }
    if (cnpjDigits.length !== 14) {
      errs.cnpj = 'O CNPJ deve ter 14 dígitos.';
    }
    if (isSignUp && !EMAIL_RE.test(empresaForm.em.trim())) {
      errs.em = 'Digite um e-mail válido.';
    }
    if (isSignUp && empresaForm.pw.length < 6) {
      errs.pw = 'A senha precisa ter ao menos 6 caracteres.';
    } else if (!isSignUp && !empresaForm.pw) {
      errs.pw = 'Informe a senha.';
    }

    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setLoginError('');
    try {
      const data = isSignUp
        ? await api.registerCompany({
            nome: empresaForm.nome.trim(),
            abertura: empresaForm.abertura,
            cnpj: cnpjDigits,
            em: empresaForm.em.trim(),
            pw: empresaForm.pw
          })
        : await api.loginCompany(cnpjDigits, empresaForm.pw);

      onAuth(data);
      if (isSignUp) addToast('Empresa cadastrada com sucesso.');
    } catch (err) {
      if (isSignUp && /CNPJ/i.test(err.message || '')) {
        setErrors({ cnpj: err.message });
      } else {
        setLoginError(err.message || 'Não foi possível concluir.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const topLabel =
    portal === 'cliente' ? 'Corporativo' : portal === 'entregador' ? 'Voltar' : 'Login do Cliente';

  return (
    <div id="app" className="dark">
      <button type="button" className="btn auth-top" onClick={switchPortal}>
        {topLabel}
      </button>

      <main className="auth">
        {portal === 'cliente' ? (
          <section className="auth-box">
            <div className="logo">
              {LOGO}
              <span>Gestão e <b>Rotas</b></span>
            </div>
            <h1>Login do Cliente</h1>

            <form onSubmit={loginCliente}>
              <label className="field">
                <span className="l">E-mail</span>
                <input
                  type="email"
                  value={clienteForm.em}
                  onChange={(e) => changeCliente('em', e.target.value)}
                  autoComplete="username"
                />
                {errors.em && <div className="hint err">{errors.em}</div>}
              </label>

              <label className="field">
                <span className="l">Senha</span>
                <input
                  type="password"
                  value={clienteForm.pw}
                  onChange={(e) => changeCliente('pw', e.target.value)}
                  autoComplete="current-password"
                />
                {errors.pw && <div className="hint err">{errors.pw}</div>}
              </label>

              {loginError && (
                <div className="hint err" style={{ marginBottom: '16px' }}>{loginError}</div>
              )}

              <button
                className="btn pri"
                type="submit"
                style={{ width: '100%' }}
                disabled={submitting}
              >
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <p className="auth-note">A senha é o ID de acesso gerado pela sua empresa.</p>
          </section>
        ) : portal === 'empresa' ? (
          <section className="auth-box">
            <div className="logo">
              {LOGO}
              <span>Gestão e <b>Rotas</b></span>
            </div>
            <h1>Área Corporativa</h1>

            <div className="seg">
              <button
                type="button"
                className={empresaMode === 'in' ? 'active' : ''}
                onClick={() => {
                  setEmpresaMode('in');
                  setErrors({});
                  setLoginError('');
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={empresaMode === 'up' ? 'active' : ''}
                onClick={() => {
                  setEmpresaMode('up');
                  setErrors({});
                  setLoginError('');
                }}
              >
                Cadastrar empresa
              </button>
            </div>

            <form onSubmit={submitEmpresa}>
              {empresaMode === 'up' && (
                <>
                  <label className="field">
                    <span className="l">Nome da empresa</span>
                    <input
                      value={empresaForm.nome}
                      onChange={(e) => changeEmpresa('nome', e.target.value)}
                    />
                    {errors.nome && <div className="hint err">{errors.nome}</div>}
                  </label>

                  <label className="field">
                    <span className="l">Data de abertura</span>
                    <input
                      type="date"
                      value={empresaForm.abertura}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => changeEmpresa('abertura', e.target.value)}
                    />
                    {errors.abertura && <div className="hint err">{errors.abertura}</div>}
                  </label>
                </>
              )}

              <label className="field">
                <span className="l">CNPJ</span>
                <input
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={empresaForm.cnpj}
                  onChange={(e) => changeEmpresa('cnpj', formatCnpj(e.target.value))}
                />
                {errors.cnpj && <div className="hint err">{errors.cnpj}</div>}
              </label>

              {empresaMode === 'up' && (
                <label className="field">
                  <span className="l">E-mail</span>
                  <input
                    type="email"
                    value={empresaForm.em}
                    onChange={(e) => changeEmpresa('em', e.target.value)}
                    autoComplete="username"
                  />
                  {errors.em && <div className="hint err">{errors.em}</div>}
                </label>
              )}

              <label className="field">
                <span className="l">Senha</span>
                <input
                  type="password"
                  value={empresaForm.pw}
                  onChange={(e) => changeEmpresa('pw', e.target.value)}
                  autoComplete={empresaMode === 'up' ? 'new-password' : 'current-password'}
                />
                {errors.pw && <div className="hint err">{errors.pw}</div>}
              </label>

              {loginError && (
                <div className="hint err" style={{ marginBottom: '16px' }}>{loginError}</div>
              )}

              <button
                className="btn pri"
                type="submit"
                style={{ width: '100%' }}
                disabled={submitting}
              >
                {submitting
                  ? empresaMode === 'up'
                    ? 'Cadastrando…'
                    : 'Entrando…'
                  : empresaMode === 'up'
                    ? 'Cadastrar empresa'
                    : 'Entrar'}
              </button>
            </form>

            {empresaMode === 'in' && (
              <button
                type="button"
                className="btn auth-alt"
                onClick={() => {
                  setPortal('entregador');
                  setErrors({});
                  setLoginError('');
                }}
              >
                Entrar como entregador
              </button>
            )}
          </section>
        ) : (
          <section className="auth-box">
            <div className="logo">
              {LOGO}
              <span>Gestão e <b>Rotas</b></span>
            </div>
            <h1>Login do Entregador</h1>

            <form onSubmit={loginEntregador}>
              <label className="field">
                <span className="l">E-mail</span>
                <input
                  type="email"
                  value={entregadorForm.em}
                  onChange={(e) => changeEntregador('em', e.target.value)}
                  autoComplete="username"
                />
                {errors.em && <div className="hint err">{errors.em}</div>}
              </label>

              <label className="field">
                <span className="l">Código de acesso</span>
                <input
                  type="password"
                  value={entregadorForm.pw}
                  onChange={(e) => changeEntregador('pw', e.target.value)}
                  autoComplete="current-password"
                />
                {errors.pw && <div className="hint err">{errors.pw}</div>}
              </label>

              {loginError && (
                <div className="hint err" style={{ marginBottom: '16px' }}>{loginError}</div>
              )}

              <button
                className="btn pri"
                type="submit"
                style={{ width: '100%' }}
                disabled={submitting}
              >
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <p className="auth-note">O código de acesso é gerado pela empresa.</p>

            <button
              type="button"
              className="btn auth-alt"
              onClick={() => {
                setPortal('empresa');
                setErrors({});
                setLoginError('');
              }}
            >
              Voltar para login corporativo
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

/* ROTEADOR DE CONTEUDO*/

function ViewContent({
  S,
  setS,
  addToast,
  changeView,
  setModalConfig,
  setLoading,
  applyServerState
}) {
  const mine = S.orders.filter((o) => o.cli === S.user.id);

  const runAction = async (action, successMessage) => {
    setLoading(true);
    try {
      const data = await action();
      applyServerState(data.state);
      if (successMessage) addToast(successMessage);
    } catch (err) {
      addToast(err.message || 'Não foi possível concluir a ação.');
    } finally {
      setLoading(false);
    }
  };

  const changeAlerts = async (value, message) => {
    setS((prev) => ({ ...prev, alerts: value }));
    try {
      const data = await api.updateAlerts(value);
      applyServerState(data.state);
      if (message) addToast(message);
    } catch (err) {
      setS((prev) => ({ ...prev, alerts: !value }));
      addToast(err.message || 'Não foi possível atualizar os alertas.');
    }
  };

  switch (S.view) {
    case 'pedidos':
      return (
        <>
          <h1>Meus pedidos</h1>
          <p>Acompanhe cada compra e rastreie a entrega.</p>
          {mine.length === 0 && <p>Nenhum pedido encontrado para este acesso.</p>}
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

    case 'entregas':
      return (
        <>
          <h1>Minhas entregas</h1>
          <p>Atualize o status e acompanhe a localização de cada entrega.</p>
          <div className="grid c3">
            {S.orders.map((o) => {
              const cliente = S.clients.find((c) => c.id === o.cli);
              return (
                <article key={o.id} className="card">
                  <h2>{o.id}: {o.prod}</h2>
                  <Badge index={o.st} />
                  <p>
                    {o.cor}, tam. {o.tam}, {o.qtd} un.<br />
                    Cliente {cliente ? cliente.nome : o.cli} · {DISTS[o.dk]}
                  </p>
                  <label className="field">
                    <span className="l">Atualizar status</span>
                    <select
                      value={o.st}
                      onChange={(e) => {
                        const newSt = Number(e.target.value);
                        runAction(
                          () => api.updateOrderStatus(o.id, newSt),
                          `Pedido ${o.id} atualizado.`
                        );
                      }}
                    >
                      {ST.map((s, i) => (
                        <option key={i} value={i}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn"
                    style={{ width: '100%' }}
                    onClick={() => setS((prev) => ({ ...prev, track: o.id, view: 'rastreio' }))}
                  >
                    Ver no mapa
                  </button>
                </article>
              );
            })}
          </div>
        </>
      );

    case 'rastreio': {
      const backView =
        S.role === 'admin' ? 'pedidosA' : S.role === 'entregador' ? 'entregas' : 'pedidos';
      const backLabel =
        S.role === 'admin'
          ? 'Voltar para pedidos'
          : S.role === 'entregador'
            ? 'Voltar para entregas'
            : 'Voltar para meus pedidos';
      const o = S.orders.find((x) => x.id === S.track) || mine[0] || S.orders[0];

      if (!o) {
        return (
          <>
            <button
              className="btn sm"
              style={{ marginBottom: '16px' }}
              onClick={() => changeView(backView)}
            >
              {backLabel}
            </button>
            <h1>Rastreamento</h1>
            <p>Nenhum pedido disponível para rastrear no momento.</p>
          </>
        );
      }

      const st = typeof o.st === 'number' && o.st >= 0 && o.st <= 2 ? o.st : 0;
      const driver = S.drivers.find((d) => d.id === o.entregador);
      const driverName = driver ? driver.nome : 'Aguardando atribuição';
      const locations = [
        'Centro de distribuição',
        'Av. Frei Serafim, Centro',
        'Endereço do cliente'
      ];
      const forecasts = ['Amanhã, 14h', 'Hoje, 16h', 'Entregue'];

      const coords = [
        [-5.08921, -42.8016],
        [-5.08551, -42.8055],
        [-5.08012, -42.8123]
      ];
      const center = coords[st];

      return (
        <>
          <button
            className="btn sm"
            style={{ marginBottom: '16px' }}
            onClick={() => changeView(backView)}
          >
            {backLabel}
          </button>
          <h1>Rastreamento do pedido {o.id}</h1>
          <p>
            {o.prod}, {o.cor}, tamanho {o.tam}. Distribuidora:{' '}
            <strong>{DISTS[o.dk]}</strong>.
          </p>
          <p>
            Entregador: <strong>{driverName}</strong> — {ST[st]} em{' '}
            {locations[st].toLowerCase()}.
          </p>

          <div className="row" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
            {S.role === 'cliente' && (
              <>
                <button
                  className="btn pri"
                  onClick={() => {
                    setS((prev) => ({
                      ...prev,
                      cur: { ...prev.cur, cliente: `empresa-${o.empresaId}` },
                      from: 'rastreio',
                      view: 'chat'
                    }));
                  }}
                >
                  Falar com {S.chats[`empresa-${o.empresaId}`]?.nome || 'a empresa'}
                </button>
                {o.entregador && (
                  <button
                    className="btn"
                    onClick={() => {
                      setS((prev) => ({
                        ...prev,
                        cur: { ...prev.cur, cliente: `entregador-${o.entregador}-${o.id}` },
                        from: 'rastreio',
                        view: 'chat'
                      }));
                    }}
                  >
                    Falar com o entregador
                  </button>
                )}
              </>
            )}

            {S.role === 'admin' && o.entregador && (
              <button
                className="btn pri"
                onClick={() => {
                  setS((prev) => ({
                    ...prev,
                    cur: {
                      ...prev.cur,
                      admin: `entregador-${o.entregador}-${S.user.companyId}`
                    },
                    from: 'rastreio',
                    view: 'chatA'
                  }));
                }}
              >
                Falar com o entregador
              </button>
            )}

            {S.role === 'entregador' && (
              <>
                <button
                  className="btn pri"
                  onClick={() => {
                    setS((prev) => ({
                      ...prev,
                      cur: {
                        ...prev.cur,
                        entregador: `entregador-${S.user.id}-${S.user.companyId}`
                      },
                      from: 'rastreio',
                      view: 'chatE'
                    }));
                  }}
                >
                  Falar com a empresa
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setS((prev) => ({
                      ...prev,
                      cur: { ...prev.cur, entregador: `entregador-${S.user.id}-${o.id}` },
                      from: 'rastreio',
                      view: 'chatE'
                    }));
                  }}
                >
                  Falar com o cliente
                </button>
              </>
            )}
          </div>

          <ol className="steps">
            {ST.map((s, i) => (
              <li key={i} className={i <= st ? 'done' : ''}>
                <span className="dot">{i < st ? '✓' : i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>

          <div className="two">
            <div
              className="map"
              style={{ width: '100%', height: '240px', borderRadius: '8px', overflow: 'hidden' }}
            >
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
                <Polyline
                  positions={coords}
                  pathOptions={{ color: '#00a847', weight: 4, dashArray: '8 8' }}
                />
                <Marker position={coords[2]}>
                  <Popup>Destino da entrega</Popup>
                </Marker>
                <CircleMarker
                  center={center}
                  radius={12}
                  pathOptions={{ color: '#00a847', fillColor: '#00a847', fillOpacity: 0.9 }}
                >
                  <Popup>Entregador: {driverName} — {ST[st]}</Popup>
                </CircleMarker>
              </MapContainer>
            </div>

            <div>
              <h2>Rastreamento do entregador</h2>
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>Item</th><th>Informação</th></tr>
                  </thead>
                  <tbody>
                    <tr><th>Entregador</th><td>{driverName}</td></tr>
                    <tr><th>Status</th><td>{ST[st]}</td></tr>
                    <tr><th>Local do entregador</th><td>{locations[st]}</td></tr>
                    <tr><th>Previsão</th><td>{forecasts[st]}</td></tr>
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
    case 'chatE':
      return (
        <ChatUI
          S={S}
          setS={setS}
          addToast={addToast}
          applyServerState={applyServerState}
          isAdmin={S.view === 'chatA'}
          isDriver={S.view === 'chatE'}
          ph={
            S.view === 'chatA'
              ? 'Responder chamado'
              : S.view === 'chatE'
                ? 'Escreva para a empresa ou cliente'
                : 'Escreva para a distribuidora'
          }
        />
      );

    case 'perfil':
      if (S.role === 'entregador') {
        const driver = S.drivers.find((d) => d.id === S.user.id);
        const entregas = S.orders.filter((o) => o.entregador === S.user.id);
        return (
          <>
            <h1>Perfil</h1>
            <div className="two" style={{ gridTemplateColumns: '1fr' }}>
              <section className="card">
                <h2>Dados do entregador</h2>
                <dl className="spec">
                  <dt>Nome</dt><dd>{esc(S.user.nome)}</dd>
                  <dt>E-mail</dt><dd>{esc(S.user.em)}</dd>
                  <dt>Código de acesso</dt><dd>{S.user.id}</dd>
                  <dt>Empresa</dt><dd>{driver?.empresa || '—'}</dd>
                </dl>
              </section>
              <section className="card">
                <h2>Resumo das entregas</h2>
                <dl className="spec">
                  <dt>Total atribuído</dt><dd>{entregas.length}</dd>
                  <dt>Em andamento</dt><dd>{entregas.filter((o) => o.st === 1).length}</dd>
                  <dt>Concluídas</dt><dd>{entregas.filter((o) => o.st === 2).length}</dd>
                </dl>
              </section>
            </div>
          </>
        );
      }
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
                    changeAlerts(
                      checked,
                      checked ? 'Alertas ativados.' : 'Alertas desativados.'
                    );
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
                <button className="btn sm" onClick={() => changeAlerts(false)}>Dispensar</button>
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
                              runAction(
                                () => api.updateStock(s.id, data),
                                'Especificações salvas.'
                              );
                            }
                          });
                        }}
                      >
                        Editar
                      </button>{' '}
                      <button
                        className="btn sm pri"
                        onClick={() => {
                          runAction(
                            () => api.restockStock(s.id),
                            `${s.nome} reabastecido.`
                          );
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
                              runAction(
                                () => api.deleteStock(s.id),
                                'Produto excluído.'
                              );
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
          <p>O status é atualizado pelo entregador responsável.</p>
          <div className="grid c3">
            {S.orders.map((o) => {
              const driver = S.drivers.find((d) => d.id === o.entregador);
              return (
                <article key={o.id} className="card">
                  <h2>{o.id}: {o.prod}</h2>
                  <Badge index={o.st} />
                  <p>
                    {o.cor}, tam. {o.tam}, {o.qtd} un.<br />
                    Cliente {o.cli} · {DISTS[o.dk]}
                  </p>
                  <p>
                    Entregador:{' '}
                    <strong>{driver ? driver.nome : 'Aguardando atribuição'}</strong>
                  </p>
                  <button
                    className="btn pri"
                    style={{ width: '100%' }}
                    onClick={() => setS((prev) => ({ ...prev, track: o.id, view: 'rastreio' }))}
                  >
                    Rastrear pedido
                  </button>
                </article>
              );
            })}
          </div>
        </>
      );

    case 'clientes':
      return (
        <ClientsAdmin
          S={S}
          setS={setS}
          addToast={addToast}
          applyServerState={applyServerState}
        />
      );

    case 'entregadores':
      return (
        <DriversAdmin
          S={S}
          setS={setS}
          addToast={addToast}
          applyServerState={applyServerState}
        />
      );

    default:
      return null;
  }
}

/* CLIENTES (ACESSO CRIADO PELA EMPRESA) */

function ClientsAdmin({ S, setS, addToast, applyServerState }) {
  const [form, setForm] = useState({ nome: '', em: '' });
  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.nome.trim().length < 3) errs.nome = 'Informe o nome do cliente.';
    if (!EMAIL_RE.test(form.em.trim())) {
      errs.em = 'Digite um e-mail válido.';
    } else if (S.clients.some((c) => c.em.toLowerCase() === form.em.trim().toLowerCase())) {
      errs.em = 'Já existe um cliente com este e-mail.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const data = await api.createClient({ nome: form.nome.trim(), em: form.em.trim() });
      applyServerState(data.state);
      setCreated(data.client);
      setForm({ nome: '', em: '' });
      addToast(`Acesso criado. ID ${data.client.id} gerado com sucesso.`);
    } catch (err) {
      setErrors({ em: err.message || 'Não foi possível criar o acesso.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1>Clientes</h1>
      <p>Crie o acesso do cliente. O ID gerado funciona como senha no login.</p>

      {created && (
        <div className="banner ok">
          <div>
            <h2>Acesso criado</h2>
            <p>
              {created.nome} — e-mail <strong>{created.em}</strong> — senha (ID){' '}
              <strong>{created.id}</strong>
            </p>
          </div>
          <button className="btn sm" onClick={() => setCreated(null)}>Fechar</button>
        </div>
      )}

      <section className="card" style={{ marginBottom: '20px' }}>
        <h2>Novo cliente</h2>
        <form onSubmit={handleCreate}>
          <div className="two">
            <label className="field">
              <span className="l">Nome do cliente</span>
              <input
                value={form.nome}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, nome: e.target.value }));
                  setErrors((prev) => ({ ...prev, nome: '' }));
                }}
              />
              {errors.nome && <div className="hint err">{errors.nome}</div>}
            </label>

            <label className="field">
              <span className="l">E-mail</span>
              <input
                type="email"
                value={form.em}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, em: e.target.value }));
                  setErrors((prev) => ({ ...prev, em: '' }));
                }}
              />
              {errors.em && <div className="hint err">{errors.em}</div>}
            </label>
          </div>

          <button className="btn pri" type="submit" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar acesso'}
          </button>
        </form>
      </section>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>ID de acesso (senha)</th>
              <th>Pedidos</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {S.clients.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.em}</td>
                <td><strong>{c.id}</strong></td>
                <td>{S.orders.filter((o) => o.cli === c.id).length}</td>
                <td>
                  <button
                    className="btn sm"
                    onClick={() => {
                      setS((prev) => ({
                        ...prev,
                        cur: { ...prev.cur, admin: `cliente-${c.id}` },
                        from: null,
                        view: 'chatA'
                      }));
                    }}
                  >
                    Conversar
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

/* ENTREGADORES (ACESSO CRIADO PELA EMPRESA) */

function DriversAdmin({ S, setS, addToast, applyServerState }) {
  const [form, setForm] = useState({ nome: '', em: '' });
  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.nome.trim().length < 3) errs.nome = 'Informe o nome do entregador.';
    if (!EMAIL_RE.test(form.em.trim())) {
      errs.em = 'Digite um e-mail válido.';
    } else if (S.drivers.some((d) => d.em.toLowerCase() === form.em.trim().toLowerCase())) {
      errs.em = 'Já existe um entregador com este e-mail.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const data = await api.createDriver({ nome: form.nome.trim(), em: form.em.trim() });
      applyServerState(data.state);
      setCreated(data.driver);
      setForm({ nome: '', em: '' });
      addToast(`Acesso criado. Código ${data.driver.id} gerado com sucesso.`);
    } catch (err) {
      setErrors({ em: err.message || 'Não foi possível criar o acesso.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1>Entregadores</h1>
      <p>Crie o acesso do entregador. O código gerado funciona como senha no login.</p>

      {created && (
        <div className="banner ok">
          <div>
            <h2>Acesso criado</h2>
            <p>
              {created.nome} — e-mail <strong>{created.em}</strong> — código{' '}
              <strong>{created.id}</strong>
            </p>
          </div>
          <button className="btn sm" onClick={() => setCreated(null)}>Fechar</button>
        </div>
      )}

      <section className="card" style={{ marginBottom: '20px' }}>
        <h2>Novo entregador</h2>
        <form onSubmit={handleCreate}>
          <div className="two">
            <label className="field">
              <span className="l">Nome do entregador</span>
              <input
                value={form.nome}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, nome: e.target.value }));
                  setErrors((prev) => ({ ...prev, nome: '' }));
                }}
              />
              {errors.nome && <div className="hint err">{errors.nome}</div>}
            </label>

            <label className="field">
              <span className="l">E-mail</span>
              <input
                type="email"
                value={form.em}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, em: e.target.value }));
                  setErrors((prev) => ({ ...prev, em: '' }));
                }}
              />
              {errors.em && <div className="hint err">{errors.em}</div>}
            </label>
          </div>

          <button className="btn pri" type="submit" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar acesso'}
          </button>
        </form>
      </section>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Código de acesso (senha)</th>
              <th>Empresa</th>
              <th>Entregas</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {S.drivers.map((d) => (
              <tr key={d.id}>
                <td>{d.nome}</td>
                <td>{d.em}</td>
                <td><strong>{d.id}</strong></td>
                <td>{d.empresa}</td>
                <td>{S.orders.filter((o) => o.entregador === d.id).length}</td>
                <td>
                  <button
                    className="btn sm"
                    onClick={() => {
                      setS((prev) => ({
                        ...prev,
                        cur: {
                          ...prev.cur,
                          admin: `entregador-${d.id}-${S.user.companyId}`
                        },
                        from: null,
                        view: 'chatA'
                      }));
                    }}
                  >
                    Conversar
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

/* CHAT */

function buildDriverStore(S) {
  return { ...S.chatsA, ...S.chats };
}

function ChatUI({ S, setS, addToast, applyServerState, isAdmin, isDriver, ph }) {
  const [inputMsg, setInputMsg] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);

  const store = isDriver
    ? buildDriverStore(S)
    : isAdmin
      ? S.chatsA
      : Object.fromEntries(
          Object.entries(S.chats).filter(([, x]) => !x.cli || x.cli === S.user.id)
        );
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
                <span>
                  {x.msgs.length ? esc(x.msgs[x.msgs.length - 1].t) : 'Nenhuma mensagem ainda'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const c = store[k];

  if (!c) {
    return (
      <>
        <h1>Mensagens</h1>
        <p className="chat-empty">Conversa não encontrada.</p>
        <button
          className="btn sm"
          onClick={() => setS((prev) => ({ ...prev, cur: { ...prev.cur, [prev.role]: null } }))}
        >
          Todas as conversas
        </button>
      </>
    );
  }

  const handleSend = async (e) => {
    e.preventDefault();
    const text = inputMsg.trim();
    if (!text || sending) return;

    const targetStore = isDriver ? c.targetStore : isAdmin ? 'chatsA' : 'chats';
    if (!targetStore) {
      addToast('Conversa indisponível.');
      return;
    }

    setSending(true);
    try {
      const data = await api.sendMessage(targetStore, k, text);
      applyServerState(data.state);
      setInputMsg('');
      addToast('Mensagem enviada.');
    } catch (err) {
      addToast(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
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
        {c.msgs.length === 0 && <p className="chat-empty">Nenhuma mensagem ainda.</p>}
        {c.msgs.map((m, idx) => {
          const mine = isDriver ? !m.me : m.me;
          return (
            <div key={idx} className={`msg ${mine ? 'me' : ''}`}>
              {esc(m.t)}
              <small>{mine ? 'Você' : c.outro || c.nome}, {m.h}</small>
            </div>
          );
        })}
      </div>

      <form className="row" onSubmit={handleSend}>
        <input
          placeholder={ph}
          value={inputMsg}
          onChange={(e) => setInputMsg(e.target.value)}
          disabled={sending}
        />
        <button className="btn pri" disabled={sending}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
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