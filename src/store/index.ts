import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RouterConfig {
  ip: string;
  user: string;
  pass: string;
}

const CONFIG_KEY = '@router_config';

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
