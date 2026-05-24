import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RouterConfig {
  id?: string;
  name?: string;
  ip: string;
  user: string;
  pass: string;
  wifiName?: string;
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
