import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from '@react-native-firebase/firestore';

export interface RouterConfig {
  id?: string;
  name?: string;
  ip: string;
  user: string;
  pass: string;
  wifiName?: string;
  vpnIp?: string;
  useVpn?: boolean;
  isCloudManaged?: boolean;
  wgClientPrivateKey?: string;
  wgClientIp?: string;
  wgServerPublicKey?: string;
  wgEndpointHost?: string;
  wgEndpointPort?: string;
  wgAllowedIps?: string;
}

const CONFIG_KEY = '@router_config';
const SAVED_ROUTERS_KEY = '@saved_routers';

export const saveConfig = async (config: RouterConfig) => {
  try {
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config', e);
  }
};

export const loadConfig = async (): Promise<RouterConfig | null> => {
  try {
    const jsonValue = await AsyncStorage.getItem(CONFIG_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Failed to load config', e);
    return null;
  }
};

export const saveSavedRouters = async (routers: RouterConfig[]) => {
  try {
    await AsyncStorage.setItem(SAVED_ROUTERS_KEY, JSON.stringify(routers));
  } catch (e) {
    console.error('Failed to save routers list', e);
  }
};

export const loadSavedRouters = async (): Promise<RouterConfig[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(SAVED_ROUTERS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Failed to load routers list', e);
    return [];
  }
};

const sanitizeForFirestore = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  } else if (obj !== null && typeof obj === 'object') {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        clean[key] = sanitizeForFirestore(obj[key]);
      }
    }
    return clean;
  }
  return obj;
};

export const syncSavedRoutersToFirestore = async (userEmail: string, routers: RouterConfig[]) => {
  try {
    const emailKey = userEmail.toLowerCase().trim();
    if (!emailKey) return;
    const db = getFirestore();
    const userDocRef = doc(db, 'users', emailKey);
    const sanitizedRouters = sanitizeForFirestore(routers);
    await setDoc(userDocRef, { savedRouters: sanitizedRouters }, { merge: true });
  } catch (e) {
    console.error('Failed to sync saved routers to Firestore:', e);
  }
};

export const loadSavedRoutersFromFirestore = async (userEmail: string): Promise<RouterConfig[] | null> => {
  try {
    const emailKey = userEmail.toLowerCase().trim();
    if (!emailKey) return null;
    const db = getFirestore();
    const userDocRef = doc(db, 'users', emailKey);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      return (data?.savedRouters as RouterConfig[]) || [];
    }
    return null;
  } catch (e) {
    console.error('Failed to load saved routers from Firestore:', e);
    return null;
  }
};

/**
 * Writes a router's FULL config (including WireGuard fields) to the global
 * 'routers/{id}' Firestore collection. The VPS server reads from this collection
 * to dynamically discover and proxy router API calls.
 */
export const registerRouterToFirestore = async (router: RouterConfig): Promise<void> => {
  try {
    if (!router.id) return;
    const db = getFirestore();
    const routerDocRef = doc(db, 'routers', router.id);
    await setDoc(routerDocRef, {
      id: router.id,
      name: router.name || router.ip,
      ip: router.ip,
      user: router.user,
      pass: router.pass,
      vpnIp: router.vpnIp || '',
      wgClientPrivateKey: router.wgClientPrivateKey || '',
      wgServerPublicKey: router.wgServerPublicKey || '',
      wgEndpointHost: router.wgEndpointHost || '',
      wgEndpointPort: router.wgEndpointPort || '13231',
      wgClientIp: router.wgClientIp || '10.88.0.2/24',
      isCloudManaged: router.isCloudManaged || false,
      registeredAt: new Date().toISOString(),
    });
    console.log(`[Firestore] Router "${router.name}" registered to routers/${router.id}`);
  } catch (e) {
    console.error('Failed to register router to Firestore:', e);
  }
};

/**
 * Removes a router config from the global 'routers/{id}' Firestore collection.
 */
export const deleteRouterFromFirestore = async (routerId: string): Promise<void> => {
  try {
    if (!routerId) return;
    const db = getFirestore();
    const routerDocRef = doc(db, 'routers', routerId);
    await deleteDoc(routerDocRef);
    console.log(`[Firestore] Router ${routerId} removed from routers collection`);
  } catch (e) {
    console.error('Failed to delete router from Firestore:', e);
  }
};

const SERVER_URL_KEY = '@server_url';

export const saveServerUrl = async (url: string) => {
  try {
    await AsyncStorage.setItem(SERVER_URL_KEY, url);
  } catch (e) {
    console.error('Failed to save server URL', e);
  }
};

export const loadServerUrl = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(SERVER_URL_KEY);
  } catch (e) {
    console.error('Failed to load server URL', e);
    return null;
  }
};
