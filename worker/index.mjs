const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const clean = (value, limit = 90) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limit && !/[&<>"'\x00-\x1f]/.test(value);
const sourceUrl = value => { try { const url=new URL(value); return value.length<=2000 && ['https:','http:'].includes(url.protocol); } catch { return false; } };
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
  {id:'official-oem',name:'Official manufacturer sources',status:'active',coverage:'Verified India model, variant, specification and price data',live:false},
  {id:'fleetbyte-catalog',name:'fleetByte Catalog',status:'active',coverage:'Global makes, models and variants',live:true},
  {id:'lets-pick-my-car',name:"Let's Pick My Car",status:'requires_api_key',coverage:'India variants, planning estimates and comparisons',live:true},
];
const launchCatalogTargets=globalThis.__launchCatalogTargets ?? {models:[]};
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
const ownerStudioPackages={
  protect:[
    {name:'Front-end paint protection film',price:42000,noCuts:true},
    {name:'Ceramic coating',price:18000,noCuts:true},
    {name:'Interior fabric protection',price:6500,noCuts:true},
  ],
  refresh:[
    {name:'Cabin deep clean',price:7500,noCuts:true},
    {name:'Exterior decontamination and polish',price:9500,noCuts:true},
    {name:'Headlamp restoration',price:3500,noCuts:true},
  ],
  modernise:[
    {name:'CarPlay / Android Auto display',price:18000,noCuts:true},
    {name:'Reverse camera',price:7500,noCuts:false},
    {name:'Parking sensor kit',price:5500,noCuts:false},
  ],
};
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
function decisionInput(input={}) {
  return {
    priority:['value','comfort','features','resale'].includes(input.priority) ? input.priority : 'value',
    household:['solo','couple','family'].includes(input.household) ? input.household : 'family',
    transmission:['any','automatic','manual'].includes(input.transmission) ? input.transmission : 'any',
  };
}
function fitExplanation(choice, input, factoryFeatures=[]) {
  const decision=decisionInput(input);
  const price=Number(choice.onRoad) || 0;
  const budget=Number(input.budget) || 0;
  const headroom=Math.max(0,budget-price);
  let score=35;
  const why=[];
  const watch=[];
  if (price && budget) {
    if (price<=budget) { score+=Math.round(4+(headroom/budget)*60); why.push(headroom>=100000?'Leaves '+Math.round(headroom/1000)+'k of your on-road budget free':'Fits within your stated on-road budget'); }
    else { score-=35; watch.push('Estimated on-road price exceeds your stated budget'); }
  }
  const isAutomatic=/auto|amt|cvt|dct|ivt/i.test(choice.gearbox ?? '');
  if (decision.transmission==='automatic') {
    if (isAutomatic) { score+=14; why.push('Matches your automatic-driving preference'); }
    else { score-=20; watch.push('Manual transmission conflicts with your preference'); }
  }
  if (decision.transmission==='manual' && !isAutomatic) { score+=10; why.push('Matches your manual-driving preference'); }
  if (decision.household==='family') {
    if ((choice.seats ?? 5)>=5) { score+=10; why.push('Practical five-seat layout for family use'); }
    else { score-=10; watch.push('Seating capacity may be tight for family use'); }
  }
  const labels=[...factoryFeatures,...(choice.highlights ?? [])].join(' ').toLowerCase();
  const wanted=(input.features ?? []).filter(id=>id==='automatic'||(id==='camera'&&/camera|parking/i.test(labels))||(id==='phone'&&/carplay|android auto|infotainment/i.test(labels)));
  if (wanted.length) { score+=wanted.length*6; why.push('Includes '+wanted.length+' of your requested features'); }
  if (decision.priority==='value' && price && budget) { score+=Math.round((headroom/budget)*12); if (price<=budget*.9) why.push('Strong budget headroom for insurance or accessories'); }
  if (decision.priority==='comfort' && isAutomatic) { score+=6; why.push('Automatic option supports easier daily driving'); }
  if (decision.priority==='features') { score+=Math.min(10,Math.floor((choice.highlights ?? []).length/2)); if ((choice.highlights ?? []).length>=3) why.push('Has a stronger listed feature set'); }
  if (decision.priority==='comfort') score+=Math.min(6,Math.floor((choice.highlights ?? []).length/4));
  if ((choice.limitations ?? []).length) watch.push(choice.limitations[0]);
  return {fitScore:Math.max(1,Math.min(99,Math.round(score))),whyItFits:why.slice(0,3),watchOuts:watch.slice(0,2),budgetHeadroom:headroom,decisionLabel:score>=75?'Strong fit':score>=55?'Worth a look':'Trade-offs to review'};
}
function providerModelName(modelId) {
  const known={magnite:'Nissan Magnite',dzire:'Maruti Suzuki Dzire',baleno:'Maruti Suzuki Baleno',punch:'Tata Punch',nexon:'Tata Nexon',swift:'Maruti Suzuki Swift',creta:'Hyundai Creta'};
  if (known[modelId]) return known[modelId];
  return String(modelId ?? '').split('-').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');
}
function confidenceFor(choice,input) {
  const price=Number(choice.onRoad)||0;
  const budget=Number(input.budget)||0;
  const automatic=/auto|amt|cvt|dct|ivt/i.test(choice.gearbox ?? '');
  const annualFuel=automatic?62000:58000;
  const annualService=Math.max(9500,Math.round(price*.012));
  const annualInsurance=Math.max(16000,Math.round(price*.025));
  const ownershipYearOne=price+annualFuel+annualService+annualInsurance;
  const ratio=budget?price/budget:0;
  const budgetRisk=ratio>1?'Over budget':ratio>.92?'Stretch':ratio>.8?'Watch spend':'Comfortable';
  const riskNote=ratio>1?'This exceeds your stated on-road budget before running costs.':ratio>.92?'Leaves little room for insurance, accessories or price movement.':ratio>.8?'Fits, but keep a buffer for insurance and accessories.':'Leaves a useful buffer for purchase-day costs.';
  return {ownershipEstimate:{period:'Year 1 planning estimate',fuel:annualFuel,service:annualService,insurance:annualInsurance,total:ownershipYearOne,disclaimer:'Internal planning range; usage, insurer, fuel price and city can change actual cost.'},budgetRisk,riskNote};
}
function archetypes(items) {
  if (!items.length) return {};
  const cheapest=[...items].sort((a,b)=>a.onRoad-b.onRoad)[0];
  const comfort=[...items].sort((a,b)=>(/auto|amt|cvt|dct|ivt/i.test(b.gearbox)?1:0)-(/auto|amt|cvt|dct|ivt/i.test(a.gearbox)?1:0)||b.fitScore-a.fitScore)[0];
  const safe=[...items].filter(item=>item.budgetRisk==='Comfortable').sort((a,b)=>b.fitScore-a.fitScore)[0] ?? items[0];
  return {bestValue:cheapest.id,bestComfort:comfort.id,safeAlternative:safe.id};
}
function preownedAssessment(input) {
  const asking=input.askingPrice;
  const transfer=input.transferCost ?? 0;
  const inspection=input.inspectionCost ?? 0;
  const immediate=input.immediateRepairCost ?? 0;
  const upgrades=input.upgradeCost ?? 0;
  const allIn=asking+transfer+inspection+immediate+upgrades;
  const required=['rc','insurance','service_history','odometer','inspection','accident','flood'];
  const checks=input.checks ?? {};
  const missing=required.filter(key=>checks[key]!=='verified');
  const failed=required.filter(key=>checks[key]==='failed');
  const risk=failed.length?'High':missing.length>=4?'High':missing.length>=2?'Medium':'Lower';
  const next=[];
  if (checks.rc!=='verified') next.push('Verify RC ownership and transfer eligibility');
  if (checks.insurance!=='verified') next.push('Verify current insurance and claim history');
  if (checks.service_history!=='verified') next.push('Request dated service records');
  if (checks.odometer!=='verified') next.push('Validate odometer against service history');
  if (checks.inspection!=='verified') next.push('Book an independent pre-purchase inspection');
  if (checks.accident!=='verified'||checks.flood!=='verified') next.push('Check accident and flood exposure before any token payment');
  if (immediate>0) next.push('Get written estimates for immediate repairs before negotiating');
  const worthInspecting=!failed.length && (missing.length<=5);
  return {allInCost:{askingPrice:asking,transfer,inspection,immediateRepairs:immediate,plannedUpgrades:upgrades,total:allIn,disclaimer:'Planning estimate only. Confirm transfer fees, condition and repair quotes before payment.'},evidence:{verified:required.filter(key=>checks[key]==='verified'),missing,failed},riskLevel:risk,worthInspecting,decision:failed.length?'Do not commit until failed checks are explained and independently verified.':missing.length>=4?'Too much evidence is missing to judge this vehicle safely. Inspect before any commitment.':'Worth inspecting if the all-in cost still fits your budget.',nextChecks:next.slice(0,5)};
}
async function recordInteraction(db,visitor,vehicleId,action) {
  await db.prepare('INSERT INTO buyer_interactions (id,visitor,vehicle_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),visitor,vehicleId,action,new Date().toISOString()).run();
}
function providerRecommendations(result, input) {
  const data=result?.data ?? result;
  return (data.items ?? []).map(item=>{
    const choice={onRoad:item.onRoad,gearbox:item.transmission,seats:item.seating?.capacity ?? null,highlights:item.highlights ?? [],limitations:item.lacks ?? []};
    return {
    id:'pmc:'+item.carId+':'+item.variantId,
    providerVariantId:item.variantId,
    modelId:item.carId,
    name:(providerModelName(item.carId)+' '+item.name).trim(),
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
    ...fitExplanation(choice,input),
    ...confidenceFor(choice,input),
  };}).sort((a,b)=>b.fitScore-a.fitScore || a.onRoad-b.onRoad);
}
async function saveBuyerProfile(db, visitor, input) {
  const preferences=JSON.stringify({budget:input.budget,city:input.city,use:input.use ?? '',features:input.features ?? [],...decisionInput(input)});
  await db.prepare('INSERT INTO buyer_profiles (visitor,preferences_json,updated_at) VALUES (?,?,?) ON CONFLICT(visitor) DO UPDATE SET preferences_json=excluded.preferences_json,updated_at=excluded.updated_at').bind(visitor,preferences,new Date().toISOString()).run();
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
    db.prepare('INSERT OR IGNORE INTO providers (id,name,kind,status,attribution,created_at) VALUES (?,?,?,?,?,?)').bind('official-oem','Official manufacturer sources','catalog','active','Variant facts and prices sourced from official manufacturer pages and brochures.',now),
    db.prepare('INSERT OR IGNORE INTO providers (id,name,kind,status,attribution,created_at) VALUES (?,?,?,?,?,?)').bind('fleetbyte-catalog','fleetByte Catalog','catalog','active','Supplementary global specifications.',now),
    db.prepare('INSERT OR IGNORE INTO providers (id,name,kind,status,attribution,created_at) VALUES (?,?,?,?,?,?)').bind('lets-pick-my-car',"Let's Pick My Car",'india_market','active','Indian catalogue, planning estimates and comparisons; attribution required.',now),
    ...cities.map(city=>db.prepare('INSERT OR IGNORE INTO cities (id,name,state_code,state_name,registration_multiplier,updated_at) VALUES (?,?,?,?,?,?)').bind(city.id,city.name,city.id==='delhi'?'DL':city.id==='bengaluru'?'KA':city.id==='mumbai'||city.id==='pune'?'MH':city.id==='chennai'?'TN':city.id==='kolkata'?'WB':city.id==='ahmedabad'?'GJ':'TS',city.state,city.cost,now)),
  ];
  await db.batch(referenceStatements);
  const targets=(launchCatalogTargets.models ?? []).map((target,index)=>db.prepare('INSERT OR IGNORE INTO catalog_curation_targets (id,brand_name,model_name,body_type,updated_at) VALUES (?,?,?,?,?)').bind('launch-'+String(index+1).padStart(2,'0'),target.brand,target.model,target.bodyType,now));
  for (let offset=0;offset<targets.length;offset+=80) await db.batch(targets.slice(offset,offset+80));
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
    FROM variants v JOIN models m ON m.id=v.model_id JOIN brands b ON b.id=m.brand_id JOIN city_prices cp ON cp.variant_id=v.id AND cp.city_id=? LEFT JOIN providers p ON p.id=cp.provider_id WHERE v.active=1 AND (v.id NOT LIKE 'oem-%' OR EXISTS (SELECT 1 FROM catalog_curation_targets target WHERE target.brand_name=b.name AND target.model_name=m.name AND target.stage='published')) ORDER BY b.name,m.name,v.ex_showroom`).bind(city.id).all();
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
    await saveBuyerProfile(db,visitor,input);
    const preferredTransmission=decisionInput(input).transmission;
    // Provider accepts city, mixed or highway. MotorForm's family journey maps
    // to mixed driving rather than failing the request and showing stale demos.
    const providerUsage=input.use==='family' ? 'mixed' : (input.use || 'city');
    const providerInput={budget:input.budget,loc:stateForCity(city.id),price:'onroad',gearbox:preferredTransmission==='automatic'||input.features.includes('automatic')?'auto':preferredTransmission==='manual'?'manual':'any',seats:decisionInput(input).household==='family'?5:4,usage:providerUsage,charging:'no'};
    let result=null;
    try { result=await cachedPickMyCar(db,env,'recommendations',JSON.stringify(providerInput),'recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(providerInput)}); }
    catch { result=null; }
    if (result) { const items=providerRecommendations(result,input); return json({source:'india_provider',city,items,decisionPaths:archetypes(items),attribution:result.attribution ?? {name:"Let's Pick My Car",url:'https://letspickmycar.com'},datasetRevision:result.datasetRevision ?? null}); }
    const internal=await catalog(db,city.id);
    const params=new URLSearchParams({budget:String(input.budget),use:input.use ?? ''});
    for (const feature of input.features) params.append('feature',feature);
    const matches=matchCars(internal,params);
    const items=matches.map(match=>{const car=internal.cars.find(item=>item.id===match.id);const choice={onRoad:match.total,gearbox:car.gearbox,seats:5,highlights:car.factory.map(key=>internal.features[key].name),limitations:[]};return {id:car.id,name:car.model+' '+car.trim,onRoad:match.total,fuel:car.fuel,gearbox:car.gearbox,highlights:choice.highlights,limitations:[],sources:[],pricesVerified:car.priceDate,specsVerified:null,dataUpdated:car.priceDate,coverageNote:'MotorForm internal estimated pricing. Confirm final dealer quote.',...fitExplanation(choice,input,car.factory),...confidenceFor(choice,input)};}).sort((a,b)=>b.fitScore-a.fitScore || a.onRoad-b.onRoad);
    return json({source:'internal_estimate',city,items,decisionPaths:archetypes(items),attribution:{name:'MotorForm internal estimated pricing',url:null}});
  }
  if (pathname === '/api/buyer-profile' && method === 'GET') {
    const profile=await db.prepare('SELECT preferences_json,updated_at FROM buyer_profiles WHERE visitor=?').bind(visitor).first();
    return json(profile ? {preferences:JSON.parse(profile.preferences_json),updatedAt:profile.updated_at} : {preferences:null});
  }
  if (pathname === '/api/decision-confidence' && method === 'GET') {
    const city=cityFor(searchParams.get('city'));
    const dealer=await db.prepare("SELECT COUNT(*) AS active, SUM(CASE WHEN response_quality='responsive' THEN 1 ELSE 0 END) AS responsive, MIN(typical_response_hours) AS fastest FROM dealers WHERE city_id=? AND active=1").bind(city.id).first();
    const interactions=await db.prepare("SELECT action,COUNT(*) AS count FROM buyer_interactions WHERE visitor=? GROUP BY action").bind(visitor).all();
    const activity=Object.fromEntries(interactions.results.map(row=>[row.action,row.count]));
    return json({city,dealerAvailability:{active:dealer?.active ?? 0,responsive:dealer?.responsive ?? 0,fastestResponseHours:dealer?.fastest ?? null,label:(dealer?.active ?? 0)>0?'Dealer network data is available for this city.':'No verified dealer availability is listed yet.'},buyerSignals:{saved:activity.saved ?? 0,compared:activity.compared ?? 0,enquired:activity.enquired ?? 0,disclaimer:'Only your own actions are used to improve your shortlist on this device.'},reviews:{status:'not_connected',label:'Verified reviews are unavailable until a licensed review provider is connected.'}});
  }
  if (pathname === '/api/interactions' && method === 'POST') {
    const input=await body(request);
    if (!input || !clean(input.vehicleId,120) || input.action!=='compared') return json({error:'Invalid interaction.'},400);
    await recordInteraction(db,visitor,input.vehicleId,'compared');
    return json({ok:true},201);
  }
  if (pathname === '/api/preowned/assess' && method === 'POST') {
    const input=await body(request);
    const costs=['askingPrice','transferCost','inspectionCost','immediateRepairCost','upgradeCost'];
    const checkNames=['rc','insurance','service_history','odometer','inspection','accident','flood'];
    if (!input || !amount(input.askingPrice) || input.askingPrice<100000 || input.askingPrice>10000000 || !costs.slice(1).every(key=>input[key]===undefined||amount(input[key])) || (input.checks!==undefined && (typeof input.checks!=='object'||!checkNames.every(key=>input.checks[key]===undefined||['verified','reported','missing','failed'].includes(input.checks[key]))))) return json({error:'Provide a valid used-car price, costs and evidence status.'},400);
    const assessment=preownedAssessment(input);
    await recordInteraction(db,visitor,'preowned:'+cacheHash(JSON.stringify({askingPrice:input.askingPrice,year:input.year ?? null,odometer:input.odometerKm ?? null})),'compared');
    return json({source:'motorform_planning_estimate',...assessment});
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
    if (pathname === '/api/operator/catalog/import' && method === 'POST') {
      const input=await body(request); const source=input?.source; const variants=input?.variants;
      const validSource=source && clean(source.name,160) && sourceUrl(source.url) && typeof source.checkedAt==='string' && /^\d{4}-\d{2}-\d{2}/.test(source.checkedAt);
      const validVariant=entry=>entry && validId(entry.brand?.id) && clean(entry.brand?.name,120) && validId(entry.model?.id) && clean(entry.model?.name,120) && clean(entry.model?.bodyType,80) && validId(entry.variant?.id) && clean(entry.variant?.name,140) && clean(entry.variant?.fuel,40) && clean(entry.variant?.gearbox,40) && (entry.variant.seats===undefined || (Number.isInteger(entry.variant.seats)&&entry.variant.seats>0&&entry.variant.seats<20)) && amount(entry.variant.exShowroom) && Array.isArray(entry.prices) && entry.prices.length>0 && entry.prices.every(price=>cities.some(city=>city.id===price.cityId)&&amount(price.onRoad)&&amount(price.registration)&&amount(price.insurance)&&['estimated','sourced','dealer_verified'].includes(price.confidence)&&sourceUrl(price.sourceUrl ?? source.url)&&typeof price.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(price.checkedAt)) && Array.isArray(entry.specifications ?? []) && (entry.specifications ?? []).every(spec=>clean(spec.key,80)&&clean(spec.label,120)&&clean(spec.value,240)&&(spec.unit===undefined||clean(spec.unit,40))&&sourceUrl(spec.sourceUrl ?? source.url)&&typeof spec.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(spec.checkedAt)) && Array.isArray(entry.equipment ?? []) && (entry.equipment ?? []).every(feature=>clean(feature.key,80)&&clean(feature.category,80)&&clean(feature.label,120)&&clean(feature.value,240)&&(feature.note===undefined||clean(feature.note,400))&&sourceUrl(feature.sourceUrl ?? source.url)&&typeof feature.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(feature.checkedAt));
      if (input?.dryRun) return json({validSource,variantCount:Array.isArray(variants)?variants.length:0,invalidVariantIndexes:Array.isArray(variants)?variants.flatMap((entry,index)=>validVariant(entry)?[]:[index]):['all']});
      if (!validSource || !Array.isArray(variants) || variants.length<1 || variants.length>250 || !variants.every(validVariant)) return json({error:'Provide a source-stamped batch of valid variants, prices, specifications and equipment.'},400);
      if (variants.some(entry=>(entry.prices?.length ?? 0)>8 || (entry.specifications?.length ?? 0)>60 || (entry.equipment?.length ?? 0)>80)) return json({error:'Keep each import record within the supported price, specification and equipment limits.'},400);
      try {
      const now=new Date().toISOString(); const importId=crypto.randomUUID(); const statements=[]; const preparedModels=new Set(); let prices=0; let specs=0; let equipment=0;
      for (const entry of variants) {
        const variant=entry.variant;
        const existingModel=await db.prepare('SELECT id FROM models WHERE brand_id=? AND name=?').bind(entry.brand.id,entry.model.name).first();
        const modelId=existingModel?.id ?? entry.model.id;
        statements.push(db.prepare('INSERT INTO brands (id,name,active,created_at,updated_at) VALUES (?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=1,updated_at=excluded.updated_at').bind(entry.brand.id,entry.brand.name,now,now));
        if (!preparedModels.has(modelId)) {
          statements.push(existingModel
            ? db.prepare('UPDATE models SET body_type=?,active=1,updated_at=? WHERE id=?').bind(entry.model.bodyType,now,modelId)
            : db.prepare('INSERT INTO models (id,brand_id,name,body_type,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(modelId,entry.brand.id,entry.model.name,entry.model.bodyType,now,now));
          preparedModels.add(modelId);
        }
        statements.push(db.prepare("INSERT INTO variants (id,model_id,name,fuel,gearbox,seats,ex_showroom,uses_json,factory_features_json,optional_features_json,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET model_id=excluded.model_id,name=excluded.name,fuel=excluded.fuel,gearbox=excluded.gearbox,seats=excluded.seats,ex_showroom=excluded.ex_showroom,active=1,updated_at=excluded.updated_at").bind(variant.id,modelId,variant.name,variant.fuel,variant.gearbox,variant.seats ?? null,variant.exShowroom,JSON.stringify(variant.uses ?? []),'[]','[]',now,now));
        for (const price of entry.prices) { prices++; statements.push(db.prepare('INSERT INTO city_prices (id,variant_id,city_id,on_road,registration,insurance,confidence,provider_id,source_url,checked_at,valid_until) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(variant_id,city_id) DO UPDATE SET on_road=excluded.on_road,registration=excluded.registration,insurance=excluded.insurance,confidence=excluded.confidence,provider_id=excluded.provider_id,source_url=excluded.source_url,checked_at=excluded.checked_at,valid_until=excluded.valid_until').bind(variant.id+'-'+price.cityId,variant.id,price.cityId,price.onRoad,price.registration,price.insurance,price.confidence,price.confidence==='estimated'?'motorform-estimates':'official-oem',price.sourceUrl ?? source.url,price.checkedAt,price.validUntil ?? null)); }
        for (const spec of entry.specifications ?? []) { specs++; statements.push(db.prepare('INSERT INTO variant_specifications (variant_id,spec_key,label,value_text,unit,confidence,source_url,checked_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(variant_id,spec_key) DO UPDATE SET label=excluded.label,value_text=excluded.value_text,unit=excluded.unit,confidence=excluded.confidence,source_url=excluded.source_url,checked_at=excluded.checked_at').bind(variant.id,spec.key,spec.label,spec.value,spec.unit ?? null,'sourced',spec.sourceUrl ?? source.url,spec.checkedAt)); }
        for (const feature of entry.equipment ?? []) { equipment++; statements.push(db.prepare('INSERT INTO variant_equipment (variant_id,feature_key,category,label,value_text,note,confidence,source_url,checked_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(variant_id,feature_key) DO UPDATE SET category=excluded.category,label=excluded.label,value_text=excluded.value_text,note=excluded.note,confidence=excluded.confidence,source_url=excluded.source_url,checked_at=excluded.checked_at').bind(variant.id,feature.key,feature.category,feature.label,feature.value,feature.note ?? null,'sourced',feature.sourceUrl ?? source.url,feature.checkedAt)); }
      }
      statements.push(db.prepare('INSERT INTO catalog_imports (id,source_name,source_url,imported_by,records_created,records_updated,created_at) VALUES (?,?,?,?,?,?,?)').bind(importId,source.name,source.url,'operator',variants.length,prices+specs+equipment,now));
      for (let offset=0;offset<statements.length;offset+=80) await db.batch(statements.slice(offset,offset+80));
      return json({id:importId,variants:variants.length,prices,specifications:specs,equipment},201);
      } catch (error) {
        return json({error:'Catalog import failed.',detail:String(error?.message ?? error).slice(0,500)},500);
      }
    }
    if (pathname === '/api/operator/catalog/targets' && method === 'GET') {
      const {results}=await db.prepare('SELECT id,brand_name,model_name,body_type,stage,source_count,imported_variant_count,note,updated_at FROM catalog_curation_targets ORDER BY stage,brand_name,model_name').all();
      return json(results);
    }
    if (pathname === '/api/operator/catalog/targets' && method === 'PATCH') {
      const input=await body(request);
      if (!input || !clean(input.id,80) || !['source_collection','variant_capture','quality_review','published','blocked'].includes(input.stage) || (input.note!==undefined && !clean(input.note,400)) || (input.sourceCount!==undefined && (!Number.isSafeInteger(input.sourceCount)||input.sourceCount<0||input.sourceCount>100)) || (input.importedVariantCount!==undefined && (!Number.isSafeInteger(input.importedVariantCount)||input.importedVariantCount<0||input.importedVariantCount>500))) return json({error:'Provide a valid curation target update.'},400);
      const result=await db.prepare('UPDATE catalog_curation_targets SET stage=?,source_count=COALESCE(?,source_count),imported_variant_count=COALESCE(?,imported_variant_count),note=COALESCE(?,note),updated_at=? WHERE id=?').bind(input.stage,input.sourceCount ?? null,input.importedVariantCount ?? null,input.note ?? null,new Date().toISOString(),input.id).run();
      if (!result.meta.changes) return json({error:'Catalog target not found.'},404);
      return json({ok:true});
    }
    if (pathname === '/api/operator/enquiries' && method === 'GET') {
      const {results} = await db.prepare('SELECT id,title,purpose,upgrades,status,created_at,updated_at,email,city_id,dealer_id,provider_id,provider_variant_id FROM enquiries ORDER BY created_at DESC LIMIT 100').all();
      return json(results);
    }
    if (pathname === '/api/operator/dealers' && method === 'GET') {
      const {results}=await db.prepare('SELECT id,name,city_id,email,active,response_quality,typical_response_hours,created_at FROM dealers ORDER BY active DESC,name LIMIT 200').all();
      return json(results);
    }
    if (pathname === '/api/operator/dealers' && method === 'POST') {
      const input=await body(request);
      if (!input || !clean(input.name,160) || !clean(input.cityId,64) || !cities.some(city=>city.id===input.cityId) || !['unrated','responsive','slow'].includes(input.responseQuality ?? 'unrated') || (input.typicalResponseHours !== undefined && (!Number.isSafeInteger(input.typicalResponseHours) || input.typicalResponseHours<1 || input.typicalResponseHours>720)) || (input.email !== undefined && (typeof input.email !== 'string' || input.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)))) return json({error:'Provide a valid dealer name, city and optional service data.'},400);
      const id=crypto.randomUUID(); const createdAt=new Date().toISOString();
      await db.prepare('INSERT INTO dealers (id,name,city_id,email,response_quality,typical_response_hours,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,input.name,input.cityId,input.email ?? null,input.responseQuality ?? 'unrated',input.typicalResponseHours ?? null,createdAt).run();
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
  if (pathname === '/api/comparison-cart') {
    if (method === 'GET') {
      const {results}=await db.prepare('SELECT payload_json FROM comparison_cart_items WHERE visitor=? ORDER BY updated_at ASC LIMIT 3').bind(visitor).all();
      return json(results.map(row=>JSON.parse(row.payload_json)));
    }
    if (method === 'PUT') {
      const input=await body(request); const vehicle=input?.vehicle;
      if (!vehicle || input.provider!=='lets-pick-my-car' || typeof vehicle.id!=='string' || !vehicle.id.startsWith('pmc:') || !validId(vehicle.modelId) || !validId(vehicle.providerVariantId) || !clean(vehicle.name,180) || !amount(vehicle.onRoad) || !clean(vehicle.fuel,40) || !clean(vehicle.gearbox,40)) return json({error:'Choose a valid live variant to compare.'},400);
      const payload=JSON.stringify(vehicle); if (payload.length>20_000) return json({error:'Vehicle payload is too large.'},400);
      const now=new Date().toISOString();
      const result=await db.prepare(`INSERT INTO comparison_cart_items (visitor,vehicle_id,provider_id,payload_json,created_at,updated_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM comparison_cart_items WHERE visitor=? AND provider_id='lets-pick-my-car')<3
        OR EXISTS(SELECT 1 FROM comparison_cart_items WHERE visitor=? AND vehicle_id=? AND provider_id='lets-pick-my-car')
        ON CONFLICT(visitor,vehicle_id,provider_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
        .bind(visitor,vehicle.id,'lets-pick-my-car',payload,now,now,visitor,visitor,vehicle.id).run();
      if (!result.meta.changes) return json({error:'Compare up to three variants at a time.'},409);
      await recordInteraction(db,visitor,vehicle.id,'compared');
      return json({ok:true},201);
    }
    if (method === 'DELETE') {
      const input=await body(request);
      if (!input || typeof input.vehicleId!=='string' || !input.vehicleId.startsWith('pmc:')) return json({error:'Choose a valid comparison item.'},400);
      await db.prepare('DELETE FROM comparison_cart_items WHERE visitor=? AND vehicle_id=? AND provider_id=?').bind(visitor,input.vehicleId,'lets-pick-my-car').run();
      return json({ok:true});
    }
  }
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
      await recordInteraction(db,visitor,vehicle.id,'saved');
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
      if (input.saved) { await db.prepare('INSERT OR IGNORE INTO shortlist (visitor,variant) VALUES (?,?)').bind(visitor,input.variant).run(); await recordInteraction(db,visitor,input.variant,'saved'); }
      else { await db.prepare('DELETE FROM shortlist WHERE visitor=? AND variant=?').bind(visitor,input.variant).run(); await recordInteraction(db,visitor,input.variant,'unsaved'); }
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
      const dealer=await db.prepare(`SELECT id,name,typical_response_hours FROM dealers WHERE city_id=? AND active=1
        ORDER BY CASE response_quality WHEN 'responsive' THEN 0 WHEN 'unrated' THEN 1 ELSE 2 END, COALESCE(typical_response_hours,999999), created_at ASC LIMIT 1`).bind(city.id).first();
      await db.prepare(`INSERT INTO enquiries (id,visitor,variant,title,purpose,upgrades,created_at,email,city_id,updated_at,provider_id,provider_variant_id,dealer_id)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM enquiries WHERE visitor=?) < 30`)
        .bind(id,visitor,car.id,(car.model+' '+car.trim).trim(),input.purpose,JSON.stringify([...new Set(input.upgrades)]),createdAt,input.email,city.id,createdAt,external?'lets-pick-my-car':null,external?input.providerVariantId:null,dealer?.id ?? null,visitor)
        .run().then(result => { if (!result.meta.changes) throw new RangeError('Limit'); });
      await db.prepare('INSERT INTO enquiry_events (id,enquiry_id,to_status,actor,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,'received','buyer',createdAt).run();
      if (dealer) await db.prepare('INSERT INTO enquiry_events (id,enquiry_id,to_status,actor,note,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'assigned','routing','Matched to an eligible city dealer',createdAt).run();
      await recordInteraction(db,visitor,input.variant,'enquired');
      return json({id,status:'received',routing:dealer?{status:'assigned',dealerName:dealer.name,typicalResponseHours:dealer.typical_response_hours ?? null}:{status:'queued'}},201);
    }
  }
  if (pathname === '/api/owner-requests' && method === 'POST') {
    const input=await body(request);
    const packageItems=ownerStudioPackages[input?.packageId];
    const validRequest=input && packageItems && clean(input.make,80) && clean(input.model,100) && Number.isSafeInteger(input.year) && input.year>=1980 && input.year<=new Date().getFullYear()+1 && clean(input.variant,100) && Array.isArray(input.items) && input.items.length>=1 && input.items.length<=packageItems.length && input.items.every(item=>typeof item==='string') && new Set(input.items).size===input.items.length && typeof input.noWiringCuts==='boolean' && typeof input.email==='string' && input.email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email);
    const selected=validRequest ? packageItems.filter(item=>input.items.includes(item.name)) : [];
    if (!validRequest || selected.length!==input.items.length || (input.noWiringCuts && selected.some(item=>!item.noCuts))) return json({error:'Complete your vehicle, eligible services and email before requesting a quote.'},400);
    const estimatedTotal=selected.reduce((sum,item)=>sum+item.price,0);
    const id=crypto.randomUUID(); const createdAt=new Date().toISOString(); const city=cityFor(input.city);
    await db.prepare('INSERT INTO owner_requests (id,visitor,package_id,make,model,year,variant,items_json,estimated_total,no_wiring_cuts,email,city_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,visitor,input.packageId,input.make,input.model,input.year,input.variant,JSON.stringify(selected.map(item=>item.name)),estimatedTotal,input.noWiringCuts?1:0,input.email,city.id,createdAt).run();
    return json({id,status:'received',estimatedTotal},201);
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
