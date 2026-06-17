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
  model?: 'hap-ax2' | 'l009' | 'other';
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
    if (jsonValue != null) {
      const parsed = JSON.parse(jsonValue);
      // Failsafe: if we accidentally saved a single object instead of an array, wrap it
      if (!Array.isArray(parsed)) {
        if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
          return [parsed as RouterConfig];
        }
        return [];
      }
      return parsed;
    }
    return [];
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
    const dataToSave: any = {
      id: router.id,
      name: router.name || router.ip,
      ip: router.ip,
      user: router.user,
      pass: router.pass,
      wifiName: router.wifiName || '',
      model: router.model || 'other',
      isCloudManaged: router.isCloudManaged || false,
      registeredAt: new Date().toISOString(),
    };
    
    if (router.vpnIp !== undefined) dataToSave.vpnIp = router.vpnIp;
    if (router.wgClientPrivateKey !== undefined) dataToSave.wgClientPrivateKey = router.wgClientPrivateKey;
    if (router.wgServerPublicKey !== undefined) dataToSave.wgServerPublicKey = router.wgServerPublicKey;
    if (router.wgEndpointHost !== undefined) dataToSave.wgEndpointHost = router.wgEndpointHost;
    if (router.wgEndpointPort !== undefined) dataToSave.wgEndpointPort = router.wgEndpointPort;
    if (router.wgClientIp !== undefined) dataToSave.wgClientIp = router.wgClientIp;

    await setDoc(routerDocRef, dataToSave, { merge: true });
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
