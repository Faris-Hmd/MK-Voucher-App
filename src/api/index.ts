import { loadConfig } from '../store';
import { Buffer } from 'buffer'; // Need to polyfill or use btoa. React Native provides atob/btoa natively now sometimes, but let's just implement a simple b64 encoder or rely on standard libs. Actually, RN doesn't have native btoa. 

// A lightweight btoa for RN without adding buffer dependency if we don't have it.
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const btoa = (input: string) => {
  let str = input;
  let output = '';

  for (let block = 0, charCode, i = 0, map = chars;
  str.charAt(i | 0) || (map = '=', i % 1);
  output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = str.charCodeAt(i += 3/4);
    if (charCode > 0xFF) {
      throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
    }
    block = block << 8 | charCode;
  }
  return output;
};

const getAuthHeaders = async () => {
  const config = await loadConfig();
  if (!config) throw new Error("Router not configured. Please go to Settings.");
  
  const auth = btoa(`${config.user}:${config.pass}`);
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
};

const getBaseUrl = async () => {
  const config = await loadConfig();
  if (!config) throw new Error("Router not configured.");
  
  // Clean up URL if they added http:// or trailing slash
  let ip = config.ip.trim();
  if (!ip.startsWith('http://') && !ip.startsWith('https://')) {
    ip = `http://${ip}`;
  }
  if (ip.endsWith('/')) {
    ip = ip.slice(0, -1);
  }
  return ip;
};

// Generate random string
export const generateRandomString = (length: number): string => {
  const characters = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export const fetchProfilesAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/profile`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch profiles (${res.status}): ${txt.substring(0, 100)}`);
  }
  
  const data = await res.json();
  return data.map((p: any) => p.name).filter((name: string) => name !== 'default');
};

export const createProfileAPI = async (name: string, validity: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  
  // Simple check for schedule script
  const scheduleName = `expire-" . $user`;
  const script = `:local scheduleName ("${scheduleName}")\r\n:if ([:len [/system scheduler find name=$scheduleName]] = 0) do={\r\n  /system scheduler add name=$scheduleName start-time=startup interval=${validity} on-event="/ip hotspot user remove [find name=\\"$user\\"]\\r\\n/ip hotspot active remove [find user=\\"$user\\"]\\r\\n/system scheduler remove [find name=\\"$scheduleName\\"]"\r\n}`;
  
  const body = {
    name,
    "shared-users": "1",
    "on-login": script
  };
  
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/profile/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create profile (${res.status}): ${txt.substring(0, 100)}`);
  }
  return await res.json();
};

export const createVouchersAPI = async (profile: string, count: number, length: number) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  
  const results = [];
  // Sequentially create to avoid overwhelming the router, or Promise.all batches
  for (let i = 0; i < count; i++) {
    const pin = generateRandomString(length);
    const body = {
      name: pin,
      password: pin,
      profile: profile,
      server: 'all'
    };
    
    try {
      const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/add`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (res.ok) {
        results.push(pin);
      } else {
        const txt = await res.text();
        throw new Error(`Router rejected voucher: ${txt}`);
      }
    } catch (err: any) {
      throw new Error(err.message || "Network request failed");
    }
  }
  return results;
};

export const fetchVouchersAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch users (${res.status}): ${txt.substring(0, 100)}`);
  }
  
  return await res.json();
};

export const deleteVouchersAPI = async (ids: string[]) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  
  // Sequential delete
  for (const id of ids) {
    try {
      await fetch(`${baseUrl}/rest/ip/hotspot/user/remove`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ".id": id })
      });
    } catch(err) {
      console.warn(`Failed to delete ${id}`, err);
    }
  }
};
