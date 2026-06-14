import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc } from '@react-native-firebase/firestore';

export interface RouterConfig {
  id?: string;
  name?: string;
  ip: string;
  user: string;
  pass: string;
  wifiName?: string;
  vpnIp?: string;
  useVpn?: boolean;
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

export const syncSavedRoutersToFirestore = async (userEmail: string, routers: RouterConfig[]) => {
  try {
    const emailKey = userEmail.toLowerCase().trim();
    if (!emailKey) return;
    const db = getFirestore();
    const userDocRef = doc(db, 'users', emailKey);
    await setDoc(userDocRef, { savedRouters: routers }, { merge: true });
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
