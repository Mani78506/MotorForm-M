const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const clean = (value, limit = 90) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limit && !/[&<>"'\x00-\x1f]/.test(value);
const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
const uuid = /^[0-9a-f-]{36}$/;
const purposes = ['quote','test-drive'];
const next = {received:['reviewed','closed'],reviewed:['forwarded','closed'],forwarded:['replied','closed'],replied:['closed'],closed:[]};

async function catalog(db) {
  const row = await db.prepare('SELECT payload FROM catalog WHERE id = 1').first();
  if (row) return JSON.parse(row.payload);
  await db.prepare('INSERT OR IGNORE INTO catalog (id,payload) VALUES (1,?)').bind(JSON.stringify({...seed, illustrative:true})).run();
  return JSON.parse((await db.prepare('SELECT payload FROM catalog WHERE id = 1').first()).payload);
}

function validCatalog(data) {
  if (!data || typeof data.illustrative !== 'boolean' || !data.features || !Array.isArray(data.cars) || data.cars.length > 500) return false;
  const entries = Object.entries(data.features);
  if (entries.length > 100 || !entries.every(([id,f]) => validId(id) && f && clean(f.name) && (f.cost === undefined || amount(f.cost)))) return false;
  const ids = new Set();
  return data.cars.every(car => {
    if (!car || !validId(car.id) || ids.has(car.id)) return false;
    ids.add(car.id);
    return ['model','trim','body','fuel','gearbox'].every(key => clean(car[key])) &&
      amount(car.base) && amount(car.costs) &&
      (data.illustrative || (Number.isInteger(car.year) && car.year >= 2000 && car.year <= 2100 && clean(car.source,220) && /^\d{4}-\d{2}-\d{2}$/.test(car.priceDate))) &&
      Array.isArray(car.uses) && car.uses.every(use => ['city','family','highway'].includes(use)) &&
      ['factory','options'].every(key => Array.isArray(car[key]) && new Set(car[key]).size === car[key].length &&
        car[key].every(id => Object.hasOwn(data.features,id) && (key === 'factory' || (amount(data.features[id].cost) && !car.factory.includes(id)))));
  });
}

async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 230_000) { await reader.cancel(); return null; }
    text += decoder.decode(value,{stream:true});
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

function matchCars(data, params) {
  const budget = Number(params.get('budget')) || Infinity;
  const use = params.get('use');
  const query = (params.get("q") ?? "").trim().toLowerCase().split(/\s+/);
  const required = [...new Set(params.getAll('feature'))].filter(id => Object.hasOwn(data.features,id));
  return data.cars.flatMap(car => {
    if (!query.every(term => (car.model+" "+car.trim+" "+car.body).toLowerCase().includes(term))) return [];
    if ((use && !car.uses.includes(use)) || required.some(id => !car.factory.includes(id) && !car.options.includes(id))) return [];
    const upgrades = required.filter(id => !car.factory.includes(id));
    const total = car.base + car.costs + upgrades.reduce((sum,id) => sum + data.features[id].cost,0);
    return total <= budget ? [{id:car.id,total,upgrades,factoryCount:required.length-upgrades.length}] : [];
  }).sort((a,b) => b.factoryCount-a.factoryCount || a.total-b.total).slice(0,3);
}

async function api(request, env, url, visitor) {
  const db = env.DB;
  if (!db) return json({error:'Database is unavailable.'},503);
  const {pathname,searchParams} = url;
  const method = request.method;
  if (!['GET','HEAD'].includes(method) && request.headers.get('origin') !== url.origin) return json({error:'Invalid origin.'},403);
  if (pathname.startsWith('/api/operator/')) {
    if (!env.MOTORFORM_OPERATOR_KEY || request.headers.get('authorization') !== 'Bearer '+env.MOTORFORM_OPERATOR_KEY) return json({error:'Operator access required.'},401);
    if (pathname === '/api/operator/catalog' && method === 'PUT') {
      const input = await body(request);
      if (!validCatalog(input)) return json({error:'Invalid catalog. Check configurations, dates and feature references.'},400);
      await db.prepare('INSERT INTO catalog (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(JSON.stringify(input)).run();
      return json({ok:true});
    }
    if (pathname === '/api/operator/enquiries' && method === 'GET') {
      const {results} = await db.prepare('SELECT id,title,purpose,upgrades,status,created_at,email FROM enquiries ORDER BY created_at DESC LIMIT 100').all();
      return json(results);
    }
    if (pathname === '/api/operator/enquiries' && method === 'PATCH') {
      const input = await body(request);
      if (!input || !uuid.test(input.id) || !Object.hasOwn(next,input.from) || !next[input.from].includes(input.status)) return json({error:'Invalid status change.'},400);
      const result = await db.prepare('UPDATE enquiries SET status=? WHERE id=? AND status=?').bind(input.status,input.id,input.from).run();
      return result.meta.changes ? json({ok:true}) : json({error:'Request status changed. Reload the queue.'},409);
    }
    return json({error:'Unknown operator endpoint.'},404);
  }
  if (pathname === '/api/catalog' && method === 'GET') return json(await catalog(db));
  if (pathname === '/api/matches' && method === 'GET') return json(matchCars(await catalog(db),searchParams));
  if (pathname === '/api/shortlist') {
    if (method === 'GET') {
      const {results} = await db.prepare('SELECT variant FROM shortlist WHERE visitor=?').bind(visitor).all();
      return json(results.map(row => row.variant));
    }
    if (method === 'PUT') {
      const input = await body(request);
      if (!input || typeof input.saved !== 'boolean' || !(await catalog(db)).cars.some(car => car.id === input.variant)) return json({error:'Unknown variant.'},400);
      if (input.saved) await db.prepare('INSERT OR IGNORE INTO shortlist (visitor,variant) VALUES (?,?)').bind(visitor,input.variant).run();
      else await db.prepare('DELETE FROM shortlist WHERE visitor=? AND variant=?').bind(visitor,input.variant).run();
      return json({ok:true});
    }
  }
  if (pathname === '/api/enquiries') {
    if (method === 'GET') {
      const {results} = await db.prepare('SELECT id,title,purpose,status,created_at FROM enquiries WHERE visitor=? ORDER BY created_at DESC LIMIT 30').bind(visitor).all();
      return json(results);
    }
    if (method === 'POST') {
      const input = await body(request);
      const data = await catalog(db);
      const car = data.cars.find(item => item.id === input?.variant);
      if (!car || !purposes.includes(input.purpose) || !Array.isArray(input.upgrades) ||
        input.upgrades.length > 100 || !input.upgrades.every(id => car.options.includes(id)) ||
        typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return json({error:'Choose a valid variant, purpose and email.'},400);
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO enquiries (id,visitor,variant,title,purpose,upgrades,created_at,email)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM enquiries WHERE visitor=?) < 30`)
        .bind(id,visitor,car.id,car.model+' '+car.trim,input.purpose,JSON.stringify([...new Set(input.upgrades)]),new Date().toISOString(),input.email,visitor)
        .run().then(result => { if (!result.meta.changes) throw new RangeError('Limit'); });
      return json({id,status:'received'},201);
    }
  }
  return json({error:'Endpoint not found.'},404);
}

export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const existing = /(?:^|;\s*)mf_session=([0-9a-f-]{36})(?:;|$)/.exec(request.headers.get('cookie') ?? '')?.[1];
      try {
        const visitor = existing ?? crypto.randomUUID();
        const response = await api(request,env,url,visitor);
        if (!existing) response.headers.append('Set-Cookie', `mf_session=${visitor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
        return response;
      } catch (error) {
        return error instanceof RangeError ? json({error:'Request limit reached.'},429) : json({error:'MotorForm could not load this data. Try again.'},503);
      }
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
    const name = {'/':'index.html','/studio':'studio.html','/app':'buyer.html','/app/':'buyer.html','/operator':'operator.html'}[url.pathname] ?? url.pathname.slice(1);
    const asset = Object.hasOwn(assets,name) ? assets[name] : undefined;
    return asset ? new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body),c => c.charCodeAt(0)),{headers:{
      'Content-Type':asset.type,
      'Cache-Control':asset.type === 'image/webp' ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options':'nosniff',
    }}) : new Response('Not found',{status:404});
  },
};
