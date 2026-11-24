// API única do app "Contatos de formador 2027" (Curem · Inside Sales).
// Rotas: /api?op=setup | me | mark | import | export
// Dados no Upstash Redis (Vercel Marketplace). Variáveis aceitas:
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ou KV_REST_API_URL/KV_REST_API_TOKEN.
const crypto = require('crypto');

const RURL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const ST = ['Turma fechada', 'Inscrições abertas', 'Link liberado / em liberação', 'Aguardando local ou aprovação', 'Grupo em formação', 'Em negociação', 'Travada / em risco'];
const CONF = ['', 'c1', 'c2', 'ambos', 'anual', 'busca'];

async function pipe(cmds) {
  const r = await fetch(RURL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j && j.error ? j.error : 'Falha no banco de dados');
  return j.map(e => { if (e.error) throw new Error(e.error); return e.result; });
}
const one = async cmd => (await pipe([cmd]))[0];
const token = () => crypto.randomBytes(18).toString('base64url');
const now = () => new Date().toISOString();
const pairs = a => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };
const same = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };

function out(res, code, o) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(o));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return new Promise((ok, ko) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { ko(e); } });
  });
}
async function who(req) {
  const t = String(req.headers['x-token'] || '');
  if (t.length < 20) return null;
  const [adm, sel] = await pipe([['GET', 'admin'], ['HGET', 'tok', t]]);
  if (adm && same(t, adm)) return { role: 'admin' };
  if (sel) return { role: 'seller', seller: sel };
  return null;
}

module.exports = async (req, res) => {
  try {
    if (!RURL || !RTOK) return out(res, 503, { erro: 'Banco de dados não conectado. No Vercel: Storage → Upstash Redis → conectar ao projeto e fazer Redeploy.' });
    const url = new URL(req.url, 'http://local');
    const op = url.searchParams.get('op') || '';

    // Primeira configuração: cria o link de administração (só funciona uma vez).
    if (op === 'setup') {
      const t = token() + token();
      const ok = await one(['SET', 'admin', t, 'NX']);
      if (!ok) return out(res, 409, { erro: 'Já configurado.' });
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      return out(res, 200, { admin: `https://${host}/#a=${t}` });
    }

    const w = await who(req);
    if (!w) return out(res, 401, { erro: 'Link inválido. Confira se você abriu o link completo que recebeu.' });

    if (op === 'me' || op === 'export') {
      const [seedS, m, st] = await pipe([['GET', 'seed'], ['HGETALL', 'm'], ['HGETALL', 'stok']]);
      const marks = {};
      Object.entries(pairs(m)).forEach(([k, v]) => { marks[k] = JSON.parse(v); });
      if (op === 'export') {
        if (w.role !== 'admin') return out(res, 403, { erro: 'Só a administração exporta.' });
        return out(res, 200, { at: now(), marks });
      }
      if (!seedS) return out(res, 200, { role: w.role, vazio: true });
      const seed = JSON.parse(seedS);
      if (w.role === 'admin') return out(res, 200, { role: 'admin', sellers: seed.sellers, fac: seed.fac, marks, links: pairs(st), at: seed.at });
      const fac = seed.fac.filter(f => f.own.includes(w.seller));
      const mk = {};
      fac.forEach(f => { if (marks[f.k]) mk[f.k] = marks[f.k]; });
      return out(res, 200, { role: 'seller', seller: w.seller, sellers: seed.sellers, fac, marks: mk, at: seed.at });
    }

    if (req.method !== 'POST') return out(res, 405, { erro: 'Use POST.' });
    const b = await readBody(req);

    if (op === 'mark') {
      const seed = JSON.parse((await one(['GET', 'seed'])) || 'null');
      if (!seed) return out(res, 409, { erro: 'Dados ainda não importados.' });
      const f = seed.fac.find(x => x.k === b.k);
      if (!f) return out(res, 404, { erro: 'Faculdade não encontrada.' });
      if (w.role === 'seller' && !f.own.includes(w.seller)) return out(res, 403, { erro: 'Esta faculdade não é da sua carteira.' });
      const por = w.role === 'admin' ? 'validação' : 'vendedor';
      const by = w.seller || 'admin';
      const cur = JSON.parse((await one(['HGET', 'm', b.k])) || '{}');
      const t = now();
      if ('conf' in b) {
        const v = String(b.conf || '');
        if (!CONF.includes(v)) return out(res, 400, { erro: 'Marcação inválida.' });
        cur.conf = v ? { v, em: t, por, by } : null;
      }
      if ('obs' in b) { cur.obs = String(b.obs || '').slice(0, 1000); cur.obsEm = t; cur.obsPor = por; }
      if (b.c150 && typeof b.c150 === 'object') {
        const p = b.c150, c = cur.c150 || {};
        if ('on' in p) {
          c.on = !!p.on;
          if (p.on && !f.c150) { c.val = true; c.de = p.de === 'com' ? 'com' : 'sem'; }
          if (p.on && !f.v && !c.v && w.role === 'seller') { const s = seed.sellers.find(x => x.id === w.seller); c.v = s ? s.name : ''; }
          if (!p.on) { c.val = false; c.de = ''; c.c1 = false; c.c2 = false; }
        }
        if ('c1' in p) c.c1 = !!p.c1;
        if ('c2' in p) c.c2 = !!p.c2;
        if ('st' in p) { const s = String(p.st || ''); if (s && !ST.includes(s)) return out(res, 400, { erro: 'Situação inválida.' }); c.st = s; }
        if ('obs' in p) c.obs = String(p.obs || '').slice(0, 1000);
        c.em = t; c.por = por; c.by = by;
        cur.c150 = c;
      }
      cur.at = t;
      await pipe([['HSET', 'm', b.k, JSON.stringify(cur)], ['LPUSH', 'log', JSON.stringify({ k: b.k, by, at: t, b })], ['LTRIM', 'log', 0, 4999]]);
      return out(res, 200, { k: b.k, mark: cur });
    }

    if (op === 'import') {
      if (w.role !== 'admin') return out(res, 403, { erro: 'Só a administração importa dados.' });
      if (!Array.isArray(b.sellers) || !Array.isArray(b.fac) || !b.fac.length) return out(res, 400, { erro: 'Formato inválido: esperado { sellers: [], fac: [] }.' });
      const seed = { sellers: b.sellers, fac: b.fac, at: b.at || now() };
      const st = pairs(await one(['HGETALL', 'stok']));
      const cmds = [['SET', 'seed', JSON.stringify(seed)]];
      seed.sellers.forEach(s => { if (!st[s.id]) { const t = token(); cmds.push(['HSET', 'tok', t, s.id], ['HSET', 'stok', s.id, t]); } });
      Object.entries(b.marks || {}).forEach(([k, v]) => cmds.push(['HSETNX', 'm', k, JSON.stringify(v)]));
      await pipe(cmds);
      return out(res, 200, { ok: true, faculdades: seed.fac.length, vendedores: seed.sellers.length });
    }

    return out(res, 404, { erro: 'Operação desconhecida.' });
  } catch (e) {
    return out(res, 500, { erro: String((e && e.message) || e) });
  }
};
