const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const clean = (value, limit = 90) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limit && !/[&<>"'\x00-\x1f]/.test(value);
const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
const uuid = /^[0-9a-f-]{36}$/;
const nativeSessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const purposes = ['quote','test-drive'];
const next = {received:['reviewed','closed'],reviewed:['forwarded','closed'],forwarded:['replied','closed'],replied:['closed'],closed:[]};
// Internal estimated-pricing provider. These are not dealer quotes: each city
// has transparent registration/insurance multipliers until verified feeds land.
const cities = [
  {id:'hyderabad',name:'Hyderabad',state:'Telangana',cost:1},
  {id:'bengaluru',name:'Bengaluru',state:'Karnataka',cost:1.16},
  {id:'mumbai',name:'Mumbai',state:'Maharashtra',cost:1.13},
  {id:'delhi',name:'New Delhi',state:'Delhi',cost:.94},
  {id:'pune',name:'Pune',state:'Maharashtra',cost:1.09},
  {id:'chennai',name:'Chennai',state:'Tamil Nadu',cost:1.04},
  {id:'kolkata',name:'Kolkata',state:'West Bengal',cost:.97},
  {id:'ahmedabad',name:'Ahmedabad',state:'Gujarat',cost:.96},
];
const cityFor = id => cities.find(city => city.id === id) ?? cities[0];
const stateForCity = id => ({hyderabad:'TS',bengaluru:'KA',mumbai:'MH',delhi:'DL',pune:'MH',chennai:'TN',kolkata:'WB',ahmedabad:'GJ'})[id] ?? 'TS';
const providers = [
  {id:'motorform-estimates',name:'MotorForm internal estimated pricing',status:'active',coverage:'India launch cities',live:false},
  {id:'fleetbyte-catalog',name:'fleetByte Catalog',status:'active',coverage:'Global makes, models and variants',live:true},
  {id:'lets-pick-my-car',name:"Let's Pick My Car",status:'requires_api_key',coverage:'India variants, planning estimates and comparisons',live:true},
];
async function fleetByte(path, params) {
  const url=new URL('https://fleetcatalog.disturbingbyte.pt/v1/'+path);
  for (const [key,value] of params) if (typeof value === 'string' && value.length) url.searchParams.set(key,value);
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error('Catalog provider unavailable');
  return response.json();
}
async function pickMyCar(env, path, init = {}) {
  if (!env.PMC_API_KEY) return null;
  const response=await fetch('https://letspickmycar.com/api/v1/'+path,{...init,headers:{Accept:'application/json',Authorization:'Bearer '+env.PMC_API_KEY,'Idempotency-Key':crypto.randomUUID(),...(init.headers ?? {})}});
  const result=await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? 'India catalog provider unavailable');
  return result;
}
function cacheHash(value) {
  let hash=2166136261;
  for (const char of value) { hash^=char.charCodeAt(0); hash=Math.imul(hash,16777619); }
  return (hash>>>0).toString(16);
}
async function cachedPickMyCar(db, env, resourceType, resourceKey, path, init) {
  const now=new Date();
  const cached=await db.prepare(`SELECT payload_json FROM provider_snapshots WHERE provider_id='lets-pick-my-car' AND resource_type=? AND resource_key=? AND (expires_at IS NULL OR expires_at>?) ORDER BY fetched_at DESC LIMIT 1`).bind(resourceType,resourceKey,now.toISOString()).first();
  if (cached) return JSON.parse(cached.payload_json);
  const result=await pickMyCar(env,path,init);
  if (!result) return null;
  // Provider usage and request IDs are account-private; never cache or return them.
  const publicResult=JSON.parse(JSON.stringify(result,(key,value)=>['usage','requestId'].includes(key) ? undefined : value));
  const payload=JSON.stringify(publicResult);
  const fetchedAt=now.toISOString();
  const expiresAt=new Date(now.getTime()+6*60*60*1000).toISOString();
  await db.prepare('INSERT OR IGNORE INTO provider_snapshots (id,provider_id,resource_type,resource_key,payload_json,source_url,fetched_at,expires_at,content_hash) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'lets-pick-my-car',resourceType,resourceKey,payload,'https://letspickmycar.com/developers',fetchedAt,expiresAt,cacheHash(payload)).run();
  return publicResult;
}
function providerRecommendations(result) {
  const data=result?.data ?? result;
  return (data.items ?? []).map(item=>({
    id:'pmc:'+item.carId+':'+item.variantId,
    providerVariantId:item.variantId,
    modelId:item.carId,
    name:item.name,
    exShowroom:item.exShowroom,
    onRoad:item.onRoad,
    fuel:item.fuel,
    gearbox:item.transmission,
    seats:item.seating?.capacity ?? null,
    highlights:item.highlights ?? [],
    limitations:item.lacks ?? [],
    sources:(item.sources ?? []).map(source=>({label:source.label,url:source.url,kind:source.kind,checkedAt:source.checkedAt})),
    pricesVerified:item.pricesVerified ?? null,
    specsVerified:item.specsVerified ?? null,
    dataUpdated:item.dataUpdated ?? null,
    coverageNote:item.coverageNote ?? null,
    estimatedMonthlyRunningCost:item.estimatedMonthlyRunningCost ?? null,
    estimatedOwnershipCost:item.estimatedOwnershipCost ?? null,
    detailUrl:item.href ?? null,
  }));
}
async function enforceRateLimit(db, visitor, scope, limit) {
  const windowStartedAt=Math.floor(Date.now()/60_000)*60_000;
  const bucket=scope+':'+visitor+':'+windowStartedAt;
  const now=new Date().toISOString();
  await db.prepare('INSERT INTO rate_limits (bucket,window_started_at,count,updated_at) VALUES (?,?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1,updated_at=excluded.updated_at').bind(bucket,windowStartedAt,now).run();
  const row=await db.prepare('SELECT count FROM rate_limits WHERE bucket=?').bind(bucket).first();
  if (!row || row.count>limit) throw new RangeError('Rate limit');
}

function withHyderabadEstimates(data) {
  if (!data.illustrative) return data;
  return {...data,cars:data.cars.map(car=>{
    const price = priceSnapshot.models[car.id];
    const original = seed.cars.find(item=>item.id===car.id);
    if (!price || !original || car.source || !['model','trim','fuel','gearbox','base','costs'].every(key=>car[key]===original[key])) return car;
    const [path,base,registration,insurance]=price;
    return {...car,base,costs:registration+insurance,source:priceSnapshot.source,
      priceDate:priceSnapshot.checked,priceUrl:'https://www.cardekho.com/'+path+'/price-in-hyderabad'};
  })};
}

function modelParts(label) {
  const known=['Maruti Suzuki','Hyundai','Tata'];
  const brand=known.find(value=>label.startsWith(value)) ?? label.split(' ')[0];
  return {brand,model:label.slice(brand.length).trim()};
}
async function ensureMarketplace(db) {
  const now=new Date().toISOString();
  const referenceStatements=[
    db.prepare('INSERT OR IGNORE INTO providers (id,name,kind,status,attribution,created_at) VALUES (?,?,?,?,?,?)').bind('motorform-estimates','MotorForm internal estimated pricing','internal','active','Planning estimates only; confirm final dealer quote.',now),
    db.prepare('INSERT OR IGNORE INTO providers (id,name,kind,status,attribution,created_at) VALUES (?,?,?,?,?,?)').bind('fleetbyte-catalog','fleetByte Catalog','catalog','active','Supplementary global specifications.',now),
    db.prepare('INSERT OR IGNORE INTO providers (id,name,kind,status,attribution,created_at) VALUES (?,?,?,?,?,?)').bind('lets-pick-my-car',"Let's Pick My Car",'india_market','active','Indian catalogue, planning estimates and comparisons; attribution required.',now),
    ...cities.map(city=>db.prepare('INSERT OR IGNORE INTO cities (id,name,state_code,state_name,registration_multiplier,updated_at) VALUES (?,?,?,?,?,?)').bind(city.id,city.name,city.id==='delhi'?'DL':city.id==='bengaluru'?'KA':city.id==='mumbai'||city.id==='pune'?'MH':city.id==='chennai'?'TN':city.id==='kolkata'?'WB':city.id==='ahmedabad'?'GJ':'TS',city.state,city.cost,now)),
  ];
  await db.batch(referenceStatements);
  const existing=await db.prepare('SELECT id FROM variants LIMIT 1').first();
  if (existing) return;
  const statements=[];
  for (const car of seed.cars) {
    const {brand,model}=modelParts(car.model);
    const brandId=brand.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const modelId=brandId+'-'+model.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    statements.push(
      db.prepare('INSERT OR IGNORE INTO brands (id,name,created_at,updated_at) VALUES (?,?,?,?)').bind(brandId,brand,now,now),
      db.prepare('INSERT OR IGNORE INTO models (id,brand_id,name,body_type,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(modelId,brandId,model,car.body,now,now),
      db.prepare('INSERT OR IGNORE INTO variants (id,model_id,name,fuel,gearbox,seats,ex_showroom,uses_json,factory_features_json,optional_features_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(car.id,modelId,car.trim,car.fuel,car.gearbox,5,car.base,JSON.stringify(car.uses),JSON.stringify(car.factory),JSON.stringify(car.options),now,now),
      ...cities.map(city=>db.prepare('INSERT OR IGNORE INTO city_prices (id,variant_id,city_id,on_road,registration,insurance,confidence,provider_id,checked_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(car.id+'-'+city.id,car.id,city.id,car.base+Math.round(car.costs*city.cost),Math.round(car.costs*.62*city.cost),Math.round(car.costs*.38*city.cost),'estimated','motorform-estimates',now)),
    );
  }
  await db.batch(statements);
}
async function marketplaceCatalog(db, cityId) {
  await ensureMarketplace(db);
  const city=cityFor(cityId);
  const {results}=await db.prepare(`SELECT v.id, b.name AS brand, m.name AS model, v.name AS trim, m.body_type AS body, v.fuel, v.gearbox, v.ex_showroom AS base, v.uses_json, v.factory_features_json, v.optional_features_json, cp.on_road, cp.registration, cp.insurance, cp.confidence, cp.checked_at, p.name AS source
    FROM variants v JOIN models m ON m.id=v.model_id JOIN brands b ON b.id=m.brand_id JOIN city_prices cp ON cp.variant_id=v.id AND cp.city_id=? LEFT JOIN providers p ON p.id=cp.provider_id WHERE v.active=1 ORDER BY b.name,m.name,v.ex_showroom`).bind(city.id).all();
  if (!results.length) return null;
  return {cars:results.map(row=>({id:row.id,model:row.brand+' '+row.model,trim:row.trim,body:row.body,fuel:row.fuel,gearbox:row.gearbox,base:row.base,costs:row.on_road-row.base,uses:JSON.parse(row.uses_json),factory:JSON.parse(row.factory_features_json),options:JSON.parse(row.optional_features_json),source:row.source,priceDate:row.checked_at.slice(0,10),confidence:row.confidence})),features:seed.features,illustrative:true,city,cities,estimateProvider:'MotorForm internal estimated pricing'};
}

async function catalog(db, cityId = 'hyderabad') {
  const normalized=await marketplaceCatalog(db,cityId);
  if (normalized) return normalized;
  let row = await db.prepare('SELECT payload FROM catalog WHERE id = 1').first();
  if (!row) {
    await db.prepare('INSERT OR IGNORE INTO catalog (id,payload) VALUES (1,?)').bind(JSON.stringify({...seed, illustrative:true})).run();
    row = await db.prepare('SELECT payload FROM catalog WHERE id = 1').first();
  }
  const city=cityFor(cityId);
  const data=withHyderabadEstimates(JSON.parse(row.payload));
  const cars=data.cars.map(car=>({...car,costs:Math.round(car.costs*city.cost),source:'MotorForm internal estimate',priceDate:new Date().toISOString().slice(0,10),priceUrl:undefined}));
  return {...data,cars,city,cities,estimateProvider:'MotorForm internal estimated pricing'};
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

async function api(request, env, url, visitor, native) {
  const db = env.DB;
  if (!db) return json({error:'Database is unavailable.'},503);
  await ensureMarketplace(db);
  const {pathname,searchParams} = url;
  const method = request.method;
  await enforceRateLimit(db,visitor,'api',60);
  if (pathname === '/api/providers' && method === 'GET') return json(providers);
  if (pathname === '/api/open-catalog/makes' && method === 'GET') return json(await fleetByte('makes',[['search',searchParams.get('q') ?? ''],['pageSize','20']]));
  if (pathname === '/api/india-catalog/status' && method === 'GET') {
    const data=await pickMyCar(env,'balance');
    return json(data ? {active:true,provider:'Let’s Pick My Car'} : {active:false,provider:'Let’s Pick My Car',reason:'PMC_API_KEY is not configured'});
  }
  if (pathname === '/api/india-catalog/recommendations' && method === 'POST') {
    await enforceRateLimit(db,visitor,'provider',8);
    const input=await body(request);
    if (!input || !Number.isSafeInteger(input.budget) || !clean(input.loc,8)) return json({error:'Provide a valid budget and state code.'},400);
    const result=await cachedPickMyCar(db,env,'recommendations',JSON.stringify(input),'recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    return result ? json(result) : json({error:'India catalog provider is not configured.'},503);
  }
  if (pathname === '/api/recommendations' && method === 'POST') {
    await enforceRateLimit(db,visitor,'provider',8);
    const input=await body(request);
    if (!input || !Number.isSafeInteger(input.budget) || input.budget < 300000 || input.budget > 10000000 || !['','city','family','highway'].includes(input.use ?? '') || !Array.isArray(input.features) || !input.features.every(validId)) return json({error:'Invalid recommendation preferences.'},400);
    const city=cityFor(input.city);
    const providerInput={budget:input.budget,loc:stateForCity(city.id),price:'onroad',gearbox:input.features.includes('automatic')?'auto':'open',seats:5,usage:input.use || 'city',charging:'no'};
    const result=await cachedPickMyCar(db,env,'recommendations',JSON.stringify(providerInput),'recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(providerInput)});
    if (result) return json({source:'india_provider',city,items:providerRecommendations(result),attribution:result.attribution ?? {name:"Let's Pick My Car",url:'https://letspickmycar.com'},datasetRevision:result.datasetRevision ?? null});
    const internal=await catalog(db,city.id);
    const params=new URLSearchParams({budget:String(input.budget),use:input.use ?? ''});
    for (const feature of input.features) params.append('feature',feature);
    const matches=matchCars(internal,params);
    return json({source:'internal_estimate',city,items:matches.map(match=>{const car=internal.cars.find(item=>item.id===match.id);return {id:car.id,name:car.model+' '+car.trim,onRoad:match.total,fuel:car.fuel,gearbox:car.gearbox,highlights:car.factory.map(key=>internal.features[key].name),limitations:[],sources:[],pricesVerified:car.priceDate,specsVerified:null,dataUpdated:car.priceDate,coverageNote:'MotorForm internal estimated pricing. Confirm final dealer quote.'};}),attribution:{name:'MotorForm internal estimated pricing',url:null}});
  }
  if (pathname === '/api/provider-comparisons' && method === 'POST') {
    await enforceRateLimit(db,visitor,'provider',8);
    const input=await body(request);
    if (!input || !Array.isArray(input.variants) || input.variants.length<2 || input.variants.length>3 || !input.variants.every(item=>item && validId(item.carId) && validId(item.variantId)) || !clean(input.city,64)) return json({error:'Choose two or three valid provider variants.'},400);
    const city=cityFor(input.city);
    const providerInput={variants:input.variants,price:'onroad',loc:stateForCity(city.id)};
    const result=await cachedPickMyCar(db,env,'comparisons',JSON.stringify(providerInput),'comparisons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(providerInput)});
    if (!result) return json({error:'India catalog provider is not configured.'},503);
    const data=result.data ?? result;
    return json({source:'india_provider',city,items:(data.items ?? []).map(item=>({carId:item.carId,variantId:item.variantId,name:item.name,exShowroom:item.exShowroom,onRoad:item.onRoad ?? null,features:item.features ?? [],sources:item.sources ?? [],detailUrl:item.href ?? null})),comparisonUrl:data.href ?? null,attribution:result.attribution ?? {name:"Let's Pick My Car",url:'https://letspickmycar.com'}});
  }
  if (!['GET','HEAD'].includes(method) && request.headers.get('origin') !== url.origin && !native) return json({error:'Invalid origin.'},403);
  if (pathname.startsWith('/api/operator/')) {
    if (!env.MOTORFORM_OPERATOR_KEY || request.headers.get('authorization') !== 'Bearer '+env.MOTORFORM_OPERATOR_KEY) return json({error:'Operator access required.'},401);
    if (pathname === '/api/operator/catalog' && method === 'PUT') {
      const input = await body(request);
      if (!validCatalog(input)) return json({error:'Invalid catalog. Check configurations, dates and feature references.'},400);
      await db.prepare('INSERT INTO catalog (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(JSON.stringify(input)).run();
      return json({ok:true});
    }
    if (pathname === '/api/operator/enquiries' && method === 'GET') {
      const {results} = await db.prepare('SELECT id,title,purpose,upgrades,status,created_at,updated_at,email,city_id,dealer_id,provider_id,provider_variant_id FROM enquiries ORDER BY created_at DESC LIMIT 100').all();
      return json(results);
    }
    if (pathname === '/api/operator/dealers' && method === 'GET') {
      const {results}=await db.prepare('SELECT id,name,city_id,email,active,created_at FROM dealers ORDER BY active DESC,name LIMIT 200').all();
      return json(results);
    }
    if (pathname === '/api/operator/dealers' && method === 'POST') {
      const input=await body(request);
      if (!input || !clean(input.name,160) || !clean(input.cityId,64) || !cities.some(city=>city.id===input.cityId) || (input.email !== undefined && (typeof input.email !== 'string' || input.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)))) return json({error:'Provide a valid dealer name, city and optional email.'},400);
      const id=crypto.randomUUID(); const createdAt=new Date().toISOString();
      await db.prepare('INSERT INTO dealers (id,name,city_id,email,created_at) VALUES (?,?,?,?,?)').bind(id,input.name,input.cityId,input.email ?? null,createdAt).run();
      return json({id},201);
    }
    if (pathname === '/api/operator/enquiries/assign' && method === 'POST') {
      const input=await body(request);
      if (!input || !uuid.test(input.enquiryId) || !uuid.test(input.dealerId)) return json({error:'Provide a valid enquiry and dealer.'},400);
      const dealer=await db.prepare('SELECT id,city_id FROM dealers WHERE id=? AND active=1').bind(input.dealerId).first();
      const enquiry=await db.prepare('SELECT id,city_id FROM enquiries WHERE id=?').bind(input.enquiryId).first();
      if (!dealer || !enquiry || dealer.city_id!==enquiry.city_id) return json({error:'Dealer must be active and serve the enquiry city.'},400);
      const changedAt=new Date().toISOString();
      await db.prepare('UPDATE enquiries SET dealer_id=?,updated_at=? WHERE id=?').bind(dealer.id,changedAt,enquiry.id).run();
      await db.prepare('INSERT INTO enquiry_events (id,enquiry_id,to_status,actor,note,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),enquiry.id,'assigned','operator','Assigned to dealer '+dealer.id,changedAt).run();
      return json({ok:true});
    }
    if (pathname === '/api/operator/enquiries' && method === 'PATCH') {
      const input = await body(request);
      if (!input || !uuid.test(input.id) || !Object.hasOwn(next,input.from) || !next[input.from].includes(input.status)) return json({error:'Invalid status change.'},400);
      const changedAt=new Date().toISOString();
      const result = await db.prepare('UPDATE enquiries SET status=?,updated_at=? WHERE id=? AND status=?').bind(input.status,changedAt,input.id,input.from).run();
      if (!result.meta.changes) return json({error:'Request status changed. Reload the queue.'},409);
      await db.prepare('INSERT INTO enquiry_events (id,enquiry_id,from_status,to_status,actor,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),input.id,input.from,input.status,'operator',changedAt).run();
      return json({ok:true});
    }
    return json({error:'Unknown operator endpoint.'},404);
  }
  if (pathname === '/api/cities' && method === 'GET') return json(cities);
  if (pathname === '/api/catalog' && method === 'GET') return json(await catalog(db,searchParams.get('city') ?? undefined));
  if (pathname === '/api/matches' && method === 'GET') return json(matchCars(await catalog(db,searchParams.get('city') ?? undefined),searchParams));
  if (pathname === '/api/saved-vehicles') {
    if (method === 'GET') {
      const {results}=await db.prepare('SELECT payload_json FROM saved_vehicles WHERE visitor=? ORDER BY updated_at DESC LIMIT 100').bind(visitor).all();
      return json(results.map(row=>JSON.parse(row.payload_json)));
    }
    if (method === 'PUT') {
      const input=await body(request);
      const vehicle=input?.vehicle;
      if (!vehicle || input.provider !== 'lets-pick-my-car' || typeof vehicle.id !== 'string' || !vehicle.id.startsWith('pmc:') || !clean(vehicle.name,180)) return json({error:'Invalid provider vehicle.'},400);
      const payload=JSON.stringify(vehicle);
      if (payload.length>20_000) return json({error:'Vehicle payload is too large.'},400);
      const now=new Date().toISOString();
      await db.prepare('INSERT INTO saved_vehicles (visitor,vehicle_id,provider_id,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(visitor,vehicle_id,provider_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').bind(visitor,vehicle.id,'lets-pick-my-car',payload,now,now).run();
      return json({ok:true});
    }
    if (method === 'DELETE') {
      const input=await body(request);
      if (!input || input.provider !== 'lets-pick-my-car' || typeof input.vehicleId !== 'string' || !input.vehicleId.startsWith('pmc:')) return json({error:'Invalid provider vehicle.'},400);
      await db.prepare('DELETE FROM saved_vehicles WHERE visitor=? AND vehicle_id=? AND provider_id=?').bind(visitor,input.vehicleId,'lets-pick-my-car').run();
      return json({ok:true});
    }
  }
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
      const city=cityFor(input?.city);
      const data = await catalog(db,city.id);
      const external=input?.provider==='lets-pick-my-car' && typeof input?.variant==='string' && input.variant.startsWith('pmc:') && validId(input.providerVariantId) && clean(input.title,180);
      const car = external ? {id:input.variant,model:input.title,trim:'',options:[]} : data.cars.find(item => item.id === input?.variant);
      if (!car || !purposes.includes(input.purpose) || !Array.isArray(input.upgrades) ||
        input.upgrades.length > 100 || !input.upgrades.every(id => car.options.includes(id)) ||
        typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return json({error:'Choose a valid variant, purpose and email.'},400);
      const id = crypto.randomUUID();
      const createdAt=new Date().toISOString();
      await db.prepare(`INSERT INTO enquiries (id,visitor,variant,title,purpose,upgrades,created_at,email,city_id,updated_at,provider_id,provider_variant_id)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM enquiries WHERE visitor=?) < 30`)
        .bind(id,visitor,car.id,(car.model+' '+car.trim).trim(),input.purpose,JSON.stringify([...new Set(input.upgrades)]),createdAt,input.email,city.id,createdAt,external?'lets-pick-my-car':null,external?input.providerVariantId:null,visitor)
        .run().then(result => { if (!result.meta.changes) throw new RangeError('Limit'); });
      await db.prepare('INSERT INTO enquiry_events (id,enquiry_id,to_status,actor,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,'received','buyer',createdAt).run();
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
        const session = request.headers.get('x-motorform-session');
        if (session !== null && !nativeSessionId.test(session)) return json({error:'Invalid device session.'},400);
        const native = session !== null && !request.headers.has('origin');
        const visitor = native ? 'native:'+session : existing ?? crypto.randomUUID();
        const response = await api(request,env,url,visitor,native);
        if (!native && !existing) response.headers.append('Set-Cookie', `mf_session=${visitor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
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
