import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export type Car = {
  id: string; model: string; trim: string; body: string; fuel: string; gearbox: string;
  base: number; costs: number; uses: string[]; factory: string[]; options: string[];
  year?: number; source?: string; priceDate?: string; priceUrl?: string;
};
export type Feature = { name: string; cost?: number };
export type Catalog = { cars: Car[]; features: Record<string, Feature>; illustrative: boolean };
export type Match = { id: string; total: number; upgrades: string[]; factoryCount: number };
export type Enquiry = { id: string; title: string; purpose: 'quote' | 'test-drive'; status: string; created_at: string };

const base = 'https://motorform-hyderabad.cozymatch1.chatgpt.site';
const key = 'motorform-device-session-v1';
let session: Promise<string> | undefined;

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

export const onRoad = (car: Car) => car.base + car.costs;
export const rupees = (price: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(price);
