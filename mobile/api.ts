import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export type Car = {
  id: string; model: string; trim: string; body: string; fuel: string; gearbox: string;
  base: number; costs: number; uses: string[]; factory: string[]; options: string[];
  year?: number; source?: string; priceDate?: string; priceUrl?: string;
};
export type Feature = { name: string; cost?: number };
export type City = {id:string;name:string;state:string;cost?:number};
export type Catalog = { cars: Car[]; features: Record<string, Feature>; illustrative: boolean; city: City; cities: City[]; estimateProvider?: string };
export type Match = { id: string; total: number; upgrades: string[]; factoryCount: number };
export type Enquiry = { id: string; title: string; purpose: 'quote' | 'test-drive'; status: string; created_at: string };
export type Recommendation = {id:string;providerVariantId?:string;modelId?:string;name:string;onRoad:number;exShowroom?:number;fuel:string;gearbox:string;seats?:number|null;highlights:string[];limitations:string[];sources:{label:string;url:string;kind:string;checkedAt:string}[];pricesVerified?:string|null;specsVerified?:string|null;dataUpdated?:string|null;coverageNote?:string|null;estimatedMonthlyRunningCost?:number|null;estimatedOwnershipCost?:number|null;detailUrl?:string|null;fitScore?:number;whyItFits?:string[];watchOuts?:string[];budgetHeadroom?:number;decisionLabel?:string;ownershipEstimate?:{period:string;fuel:number;service:number;insurance:number;total:number;disclaimer:string};budgetRisk?:'Comfortable'|'Watch spend'|'Stretch'|'Over budget';riskNote?:string};
export type DecisionConfidence={dealerAvailability:{active:number;responsive:number;fastestResponseHours:number|null;label:string};buyerSignals:{saved:number;compared:number;enquired:number;disclaimer:string};reviews:{status:string;label:string}};
export type PreownedAssessment={allInCost:{askingPrice:number;transfer:number;inspection:number;immediateRepairs:number;plannedUpgrades:number;total:number;disclaimer:string};evidence:{verified:string[];missing:string[];failed:string[]};riskLevel:'Lower'|'Medium'|'High';worthInspecting:boolean;decision:string;nextChecks:string[]};
export type RecommendationResponse = {source:'india_provider'|'internal_estimate';city:City;items:Recommendation[];decisionPaths?:{bestValue?:string;bestComfort?:string;safeAlternative?:string};attribution:{name:string;url:string|null};datasetRevision?:string|null};

const base = 'https://motorform-hyderabad.cozymatch1.chatgpt.site';
const key = 'motorform-device-session-v1';
let session: Promise<string> | undefined;

// The catalog is deliberately bundled with the app as a read-only fallback.
// This keeps the essential car finder usable when Expo Go is on a restricted
// Wi-Fi network or the hosted API is temporarily unavailable.
export const offlineCatalog: Catalog = {
  illustrative: true,
  city:{id:'hyderabad',name:'Hyderabad',state:'Telangana'},
  cities:[{id:'hyderabad',name:'Hyderabad',state:'Telangana'},{id:'bengaluru',name:'Bengaluru',state:'Karnataka'},{id:'mumbai',name:'Mumbai',state:'Maharashtra'},{id:'delhi',name:'New Delhi',state:'Delhi'},{id:'pune',name:'Pune',state:'Maharashtra'},{id:'chennai',name:'Chennai',state:'Tamil Nadu'},{id:'kolkata',name:'Kolkata',state:'West Bengal'},{id:'ahmedabad',name:'Ahmedabad',state:'Gujarat'}],
  estimateProvider:'MotorForm internal estimated pricing',
  features: {
    phone: {name: 'CarPlay / Android Auto', cost: 16000},
    camera: {name: 'Reverse camera', cost: 5800},
    automatic: {name: 'Automatic transmission'},
  },
  cars: [
    {id:'swift-vxi',model:'Maruti Suzuki Swift',trim:'VXi MT',body:'Hatchback',uses:['city'],base:750000,costs:102000,factory:[],options:['phone','camera'],fuel:'Petrol',gearbox:'Manual'},
    {id:'swift-zxi',model:'Maruti Suzuki Swift',trim:'ZXi+ AMT',body:'Hatchback',uses:['city'],base:950000,costs:130000,factory:['phone','camera','automatic'],options:[],fuel:'Petrol',gearbox:'Automatic'},
    {id:'baleno-delta',model:'Maruti Suzuki Baleno',trim:'Delta MT',body:'Hatchback',uses:['city','family'],base:780000,costs:107000,factory:['phone'],options:['camera'],fuel:'Petrol',gearbox:'Manual'},
    {id:'baleno-zeta',model:'Maruti Suzuki Baleno',trim:'Zeta AMT',body:'Hatchback',uses:['city','family'],base:925000,costs:126000,factory:['phone','camera','automatic'],options:[],fuel:'Petrol',gearbox:'Automatic'},
    {id:'nexon-smart',model:'Tata Nexon',trim:'Smart+ MT',body:'Compact SUV',uses:['city','family','highway'],base:900000,costs:125000,factory:[],options:['phone','camera'],fuel:'Petrol',gearbox:'Manual'},
    {id:'nexon-creative',model:'Tata Nexon',trim:'Creative+ AMT',body:'Compact SUV',uses:['city','family','highway'],base:1160000,costs:180000,factory:['phone','camera','automatic'],options:[],fuel:'Petrol',gearbox:'Automatic'},
    {id:'creta-e',model:'Hyundai Creta',trim:'E MT',body:'SUV',uses:['family','highway'],base:1110000,costs:185000,factory:[],options:['phone','camera'],fuel:'Petrol',gearbox:'Manual'},
    {id:'creta-sx',model:'Hyundai Creta',trim:'SX Tech IVT',body:'SUV',uses:['family','highway'],base:1700000,costs:266000,factory:['phone','camera','automatic'],options:[],fuel:'Petrol',gearbox:'Automatic'},
  ],
};

function getSession() {
  session ??= (async () => {
    const current = await SecureStore.getItemAsync(key);
    if (current) return current;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
    return id;
  })().catch(error => {
    session = undefined;
    throw error;
  });
  return session;
}

export async function request<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const id = method === 'GET' && (path === 'catalog' || path.startsWith('matches?'))
    ? undefined
    : await getSession();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(base + '/api/' + path, {
      method,
      headers: { Accept: 'application/json', ...(id ? {'X-MotorForm-Session': id} : {}), ...(payload ? {'Content-Type':'application/json'} : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Request failed. Please try again.');
    return result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadCatalog(city = 'hyderabad'): Promise<{catalog: Catalog; offline: boolean}> {
  try {
    return {catalog: await request<Catalog>('catalog?city='+encodeURIComponent(city)), offline: false};
  } catch {
    const selected=offlineCatalog.cities.find(item=>item.id===city) ?? offlineCatalog.city;
    return {catalog: {...offlineCatalog,city:selected,cars:offlineCatalog.cars.map(car=>({...car,costs:Math.round(car.costs*(selected.id==='bengaluru'?1.16:selected.id==='mumbai'?1.13:selected.id==='delhi'?.94:1))}))}, offline: true};
  }
}

export function getRecommendations(input:{budget:number;use:string;features:string[];city:string;priority?:'value'|'comfort'|'features'|'resale';household?:'solo'|'couple'|'family';transmission?:'any'|'automatic'|'manual'}) {
  return request<RecommendationResponse>('recommendations','POST',input);
}

export const getSavedProviderVehicles = () => request<Recommendation[]>('saved-vehicles');
export const saveProviderVehicle = (vehicle:Recommendation) => request('saved-vehicles','PUT',{provider:'lets-pick-my-car',vehicle});
export const removeProviderVehicle = (vehicleId:string) => request('saved-vehicles','DELETE',{provider:'lets-pick-my-car',vehicleId});
export const getDecisionConfidence = (city:string) => request<DecisionConfidence>('decision-confidence?city='+encodeURIComponent(city));
export const recordComparison = (vehicleId:string) => request('interactions','POST',{vehicleId,action:'compared'});
export const assessPreowned = (input:{askingPrice:number;transferCost?:number;inspectionCost?:number;immediateRepairCost?:number;upgradeCost?:number;checks:Record<string,'verified'|'reported'|'missing'|'failed'>}) => request<PreownedAssessment>('preowned/assess','POST',input);

export function offlineMatches(catalog: Catalog, budget: number, use: string, required: string[], query: string): Match[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.cars.flatMap(car => {
    const searchable = `${car.model} ${car.trim} ${car.body}`.toLowerCase();
    if (!terms.every(term => searchable.includes(term)) || (use && !car.uses.includes(use))) return [];
    if (required.some(id => !car.factory.includes(id) && !car.options.includes(id))) return [];
    const upgrades = required.filter(id => !car.factory.includes(id));
    const total = onRoad(car) + upgrades.reduce((sum, id) => sum + (catalog.features[id]?.cost ?? 0), 0);
    return total <= budget ? [{id: car.id, total, upgrades, factoryCount: required.length - upgrades.length}] : [];
  }).sort((a, b) => b.factoryCount - a.factoryCount || a.total - b.total).slice(0, 3);
}

export const onRoad = (car: Car) => car.base + car.costs;
export const rupees = (price: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(price);
