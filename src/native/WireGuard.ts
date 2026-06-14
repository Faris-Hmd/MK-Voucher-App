import { NativeModules, Platform } from 'react-native';

const { WireGuardModule } = NativeModules;

export interface WireGuardConfig {
  privateKey: string;
  address: string;
  dns?: string;
  publicKey: string;
  allowedIps: string;
  endpoint: string;
}

export function compileWgConfig(params: WireGuardConfig): string {
  const cleanPrivateKey = (params.privateKey || '').trim();
  const cleanAddress = (params.address || '').trim();
  const cleanDns = params.dns ? params.dns.trim() : '';
  const cleanPublicKey = (params.publicKey || '').trim();
  const cleanAllowedIps = (params.allowedIps || '0.0.0.0/0').trim();
  const cleanEndpoint = (params.endpoint || '').trim();

  return `[Interface]
PrivateKey = ${cleanPrivateKey}
Address = ${cleanAddress}
${cleanDns ? `DNS = ${cleanDns}` : ''}

[Peer]
PublicKey = ${cleanPublicKey}
AllowedIPs = ${cleanAllowedIps}
Endpoint = ${cleanEndpoint}
`;
}

const WireGuard = {
  connect: async (configText: string): Promise<string> => {
    if (Platform.OS !== 'android') {
      throw new Error('WireGuard Native Tunnel is only supported on Android.');
    }
    if (!WireGuardModule) {
      throw new Error('WireGuardModule is not linked/registered in the native build.');
    }
    return WireGuardModule.connect(configText);
  },

  disconnect: async (): Promise<string> => {
    if (Platform.OS !== 'android') {
      throw new Error('WireGuard Native Tunnel is only supported on Android.');
    }
    if (!WireGuardModule) {
      throw new Error('WireGuardModule is not linked/registered in the native build.');
    }
    return WireGuardModule.disconnect();
  },

  getStatus: async (): Promise<'UP' | 'DOWN' | 'TOGGLING'> => {
    if (Platform.OS !== 'android') {
      return 'DOWN';
    }
    if (!WireGuardModule) {
      return 'DOWN';
    }
    return WireGuardModule.getStatus();
  },
};

export default WireGuard;
