import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Modal, Animated, Dimensions } from 'react-native';
import { useTheme } from '../ThemeContext';
import { 
  saveConfig, 
  RouterConfig,
  saveServerUrl,
  loadServerUrl
} from '../store';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { 
  fetchWireguardInterfacesAPI, 
  createWireguardInterfaceAPI, 
  assignWireguardIpAddressAPI, 
  addWireguardPeerAPI, 
  deleteWireguardInterfaceAPI,
  fetchSystemCloudAPI,
  enableSystemCloudAPI,
  fetchRouterProfilesAPI,
  SERVER_URL,
  setServerUrl,
  formatUptimeAPI
} from '../api';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Network from 'expo-network';

export default function RouterSelectionScreen({
  userEmail,
  savedRouters,
  onUpdateSavedRouters,
  onConnectRouter,
}: {
  userEmail?: string;
  savedRouters: RouterConfig[];
  onUpdateSavedRouters: (routers: RouterConfig[]) => Promise<void>;
  onConnectRouter: (router: RouterConfig, useVpn: boolean, checkAborted?: () => boolean) => Promise<boolean>;
}) {
  const { colors, styles, mode, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const abortConnectionRef = useRef(false);

  interface RouterTelemetry {
    id: string;
    name: string;
    ip: string;
    status: 'online' | 'offline';
    identity: string;
    uptime: string;
    cpuLoad: number | null;
    totalMemory: number | null;
    freeMemory: number | null;
    activeUsers: number;
  }

  const [activeServerUrl, setActiveServerUrl] = useState(SERVER_URL);
  const [routerStatuses, setRouterStatuses] = useState<Record<string, RouterTelemetry>>({});

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let active = true;

    const connectWS = () => {
      if (!active) return;
      const wsUrl = activeServerUrl.replace(/^http/, 'ws');
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if ((message.type === 'initial_state' || message.type === 'status_update') && Array.isArray(message.data)) {
            const newStatuses: Record<string, RouterTelemetry> = {};
            message.data.forEach((item: RouterTelemetry) => {
              newStatuses[item.id] = item;
            });
            setRouterStatuses(prev => ({ ...prev, ...newStatuses }));
          }
        } catch (err) {
          console.warn('WebSocket message error:', err);
        }
      };

      ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };

      ws.onclose = () => {
        if (active) {
          reconnectTimer = setTimeout(connectWS, 5000);
        }
      };
    };

    const fetchInitial = async () => {
      try {
        const res = await fetch(`${activeServerUrl}/api/routers`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const newStatuses: Record<string, RouterTelemetry> = {};
            data.forEach((item: RouterTelemetry) => {
              newStatuses[item.id] = item;
            });
            setRouterStatuses(prev => ({ ...prev, ...newStatuses }));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch initial router statuses:', err);
      }
    };

    fetchInitial();
    connectWS();

    return () => {
      active = false;
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [activeServerUrl]);

  // Auto-sync cloud-managed routers from server on mount
  useEffect(() => {
    (async () => {
      try {
        const profiles = await fetchRouterProfilesAPI();
        if (!profiles || profiles.length === 0) return;

        const cloudConfigs: RouterConfig[] = profiles.map(p => ({
          id: p.id,
          name: p.name,
          ip: '127.0.0.1', // Not used directly — server proxies to router
          user: p.user,
          pass: p.pass,
          isCloudManaged: true,
        }));

        // Merge: add cloud routers not already in savedRouters
        const existingIds = new Set(savedRouters.map(r => r.id));
        const newCloudRouters = cloudConfigs.filter(r => !existingIds.has(r.id));
        if (newCloudRouters.length > 0) {
          await onUpdateSavedRouters([...newCloudRouters, ...savedRouters]);
        } else {
          // Update credentials for existing cloud routers in case they changed
          const updated = savedRouters.map(r => {
            const cloudMatch = cloudConfigs.find(c => c.id === r.id);
            return cloudMatch ? { ...r, ...cloudMatch } : r;
          });
          const hasChanges = JSON.stringify(updated) !== JSON.stringify(savedRouters);
          if (hasChanges) await onUpdateSavedRouters(updated);
        }
      } catch (e) {
        // Server unreachable — use existing saved routers
      }
    })();
  }, [activeServerUrl]);
  const [currentView, setCurrentView] = useState<'list' | 'form'>('list');

  // Local Form State
  const [deviceName, setDeviceName] = useState('');
  const [ip, setIp] = useState('192.168.1.56');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('admin');
  const [wifiName, setWifiName] = useState('WI-FI ACCESS');

  // WireGuard Form Fields
  const [vpnIp, setVpnIp] = useState('10.88.0.1');
  const [wgClientPrivateKey, setWgClientPrivateKey] = useState('');
  const [wgClientIp, setWgClientIp] = useState('10.88.0.2/24');
  const [wgServerPublicKey, setWgServerPublicKey] = useState('');
  const [wgEndpointHost, setWgEndpointHost] = useState('');
  const [wgEndpointPort, setWgEndpointPort] = useState('13231');
  const [wgAllowedIps, setWgAllowedIps] = useState('0.0.0.0/0');
  const [isWgSectionExpanded, setIsWgSectionExpanded] = useState(false);
  const [showAdvancedWg, setShowAdvancedWg] = useState(false);

  // Interactivity state
  const [editingRouterId, setEditingRouterId] = useState<string | null>(null);
  const [connectingRouterId, setConnectingRouterId] = useState<string | null>(null);
  const [connectingMode, setConnectingMode] = useState<'LOCAL' | 'VPN' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);

  // MNDP Auto-Discovery State
  interface DiscoveredRouter {
    mac: string;
    ip: string;
    name: string;
    platform?: string;
    version?: string;
  }
  const [discoveredRouters, setDiscoveredRouters] = useState<DiscoveredRouter[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDiscoveredListVisible, setIsDiscoveredListVisible] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState(SERVER_URL);

  const handleSaveServerUrl = async () => {
    if (!tempServerUrl.trim()) {
      Alert.alert('Invalid URL', 'Backend server URL cannot be empty.');
      return;
    }
    let formattedUrl = tempServerUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'http://' + formattedUrl;
    }
    try {
      await saveServerUrl(formattedUrl);
      setServerUrl(formattedUrl);
      setTempServerUrl(formattedUrl);
      setActiveServerUrl(formattedUrl);
      Alert.alert('Success', 'Backend server URL updated successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'An error occurred.');
    }
  };
  const [drawerRendered, setDrawerRendered] = useState(false);

  const formAnim = useRef(new Animated.Value(0)).current;
  const settingsAnim = useRef(new Animated.Value(0)).current;
  const drawerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (currentView === 'form') {
      setFormVisible(true);
      Animated.spring(formAnim, {
        toValue: 1,
        tension: 55,
        friction: 9,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(formAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true
      }).start(() => setFormVisible(false));
    }
  }, [currentView]);

  useEffect(() => {
    if (isSettingsOpen) {
      setTempServerUrl(SERVER_URL);
      setSettingsVisible(true);
      Animated.spring(settingsAnim, {
        toValue: 1,
        tension: 55,
        friction: 9,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(settingsAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true
      }).start(() => setSettingsVisible(false));
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isAddDrawerOpen) {
      setDrawerRendered(true);
      Animated.spring(drawerAnim, {
        toValue: 1,
        tension: 60,
        friction: 10,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(drawerAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }).start(() => setDrawerRendered(false));
    }
  }, [isAddDrawerOpen]);

  // Zero-Touch State
  const [isZeroTouchLoading, setIsZeroTouchLoading] = useState(false);
  const [zeroTouchStatus, setZeroTouchStatus] = useState('');
  const [isImportTextModalVisible, setIsImportTextModalVisible] = useState(false);
  const [importText, setImportText] = useState('');

  const sanitizeBase64Key = (key: string): string => {
    return (key || '').replace(/[^A-Za-z0-9+/=]/g, '').trim();
  };

  const handleImportWgConf = (configText: string) => {
    if (!configText || !configText.trim()) {
      Alert.alert('Error', 'Configuration text is empty.');
      return false;
    }

    const result: {
      privateKey?: string;
      address?: string;
      dns?: string;
      publicKey?: string;
      endpointHost?: string;
      endpointPort?: string;
      allowedIps?: string;
    } = {};

    const lines = configText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    
    for (const line of lines) {
      if (line.startsWith('[') && line.endsWith(']')) continue;
      const parts = line.split('=');
      if (parts.length < 2) continue;
      const key = parts[0].trim().toLowerCase();
      const rawValue = parts.slice(1).join('=').trim();
      const value = rawValue.split('#')[0].split(';')[0].trim();

      if (key === 'privatekey') {
        result.privateKey = value;
      } else if (key === 'address') {
        result.address = value;
      } else if (key === 'dns') {
        result.dns = value;
      } else if (key === 'publickey') {
        result.publicKey = value;
      } else if (key === 'allowedips') {
        result.allowedIps = value;
      } else if (key === 'endpoint') {
        const lastColon = value.lastIndexOf(':');
        if (lastColon !== -1) {
          result.endpointHost = value.substring(0, lastColon);
          result.endpointPort = value.substring(lastColon + 1);
        } else {
          result.endpointHost = value;
        }
      }
    }

    if (!result.privateKey && !result.publicKey) {
      Alert.alert('Import Failed', 'Could not find valid [Interface] or [Peer] keys in the configuration.');
      return false;
    }

    if (result.privateKey) setWgClientPrivateKey(sanitizeBase64Key(result.privateKey));
    if (result.address) setWgClientIp(result.address);
    if (result.dns) setVpnIp(result.dns);
    if (result.publicKey) setWgServerPublicKey(sanitizeBase64Key(result.publicKey));
    if (result.endpointHost) setWgEndpointHost(result.endpointHost);
    if (result.endpointPort) setWgEndpointPort(result.endpointPort);
    if (result.allowedIps) setWgAllowedIps(result.allowedIps);

    Alert.alert('Success', 'WireGuard / Back to Home configuration parsed and loaded successfully!');
    return true;
  };

  const handleImportFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Alert.alert('Clipboard Empty', 'Please copy your WireGuard / Back to Home configuration profile (text) to your clipboard first.');
        return;
      }
      handleImportWgConf(text);
    } catch (err: any) {
      Alert.alert('Clipboard Error', err.message || 'Failed to read clipboard.');
    }
  };

  const handleZeroTouch = async () => {
    if (!ip || !user) {
      Alert.alert('Validation Error', 'Please fill in the Router IP, Username, and Password fields first to connect.');
      return;
    }

    setIsZeroTouchLoading(true);
    setZeroTouchStatus('Step 1/6: Checking router IP Cloud DDNS status...');
    try {
      const tempConfig: RouterConfig = { ip, user, pass };
      await saveConfig(tempConfig);

      let endpointHost = ip;
      try {
        const cloudData = await fetchSystemCloudAPI();
        const cloudObj = Array.isArray(cloudData) ? cloudData[0] : cloudData;
        if (!cloudObj || cloudObj['ddns-enabled'] !== 'true' || !cloudObj['dns-name']) {
          setZeroTouchStatus('Step 1/6: Enabling MikroTik IP Cloud DDNS...');
          await enableSystemCloudAPI();
          await new Promise(r => setTimeout(r, 2000));
          const updatedCloud = await fetchSystemCloudAPI();
          const updatedCloudObj = Array.isArray(updatedCloud) ? updatedCloud[0] : updatedCloud;
          endpointHost = updatedCloudObj?.['dns-name'] || ip;
        } else {
          endpointHost = cloudObj['dns-name'];
        }
      } catch (cloudErr) {
        console.warn('Failed to check/enable cloud DDNS:', cloudErr);
      }

      setZeroTouchStatus('Step 2/6: Generating client Curve25519 keys on router...');
      const tempIfaceName = `wg-temp-${Date.now()}`;
      await createWireguardInterfaceAPI(tempIfaceName, 13999);
      
      const allWg = await fetchWireguardInterfacesAPI();
      const tempIface = allWg.find((x: any) => x.name === tempIfaceName);
      if (!tempIface || !tempIface['private-key'] || !tempIface['public-key']) {
        throw new Error('Router failed to auto-generate keys for temporary interface.');
      }
      const clientPrivateKey = tempIface['private-key'];
      const clientPublicKey = tempIface['public-key'];

      setZeroTouchStatus('Step 3/6: Cleaning up temporary keys...');
      await deleteWireguardInterfaceAPI(tempIface['.id']);

      setZeroTouchStatus('Step 4/6: Creating main WireGuard interface...');
      const serverPort = 13231;
      const serverIfaceName = `wg-vpn`;
      const serverExists = allWg.some((x: any) => x.name === serverIfaceName);
      const finalServerName = serverExists ? `wg-vpn-${Date.now()}` : serverIfaceName;

      await createWireguardInterfaceAPI(finalServerName, serverPort);

      const updatedWgList = await fetchWireguardInterfacesAPI();
      const serverIface = updatedWgList.find((x: any) => x.name === finalServerName);
      if (!serverIface || !serverIface['public-key']) {
        throw new Error('Router failed to verify final VPN interface.');
      }
      const serverPublicKey = serverIface['public-key'];

      setZeroTouchStatus('Step 5/6: Assigning IP address...');
      const serverVpnIp = vpnIp || '10.88.0.1';
      await assignWireguardIpAddressAPI(`${serverVpnIp}/24`, finalServerName);

      setZeroTouchStatus('Step 6/6: Creating peer config...');
      const clientVpnIp = wgClientIp.split('/')[0] || '10.88.0.2';
      await addWireguardPeerAPI(
        finalServerName,
        clientPublicKey,
        '',
        serverPort,
        `${clientVpnIp}/32`
      );

      setWgClientPrivateKey(sanitizeBase64Key(clientPrivateKey));
      setWgServerPublicKey(sanitizeBase64Key(serverPublicKey));
      setWgEndpointHost(endpointHost);
      setWgEndpointPort(serverPort.toString());
      setShowAdvancedWg(true);

      Alert.alert('Auto-Configuration Success', 'WireGuard VPN configured on router successfully!');
    } catch (e: any) {
      Alert.alert('Auto-Configuration Failed', e.message || 'Verification of router configuration failed.');
    } finally {
      setIsZeroTouchLoading(false);
      setZeroTouchStatus('');
    }
  };

  const handleAutoScan = async () => {
    setIsScanning(true);
    setIsAddDrawerOpen(false);

    try {
      const ipAddress = await Network.getIpAddressAsync();
      console.log('📱 Phone local IP:', ipAddress);

      if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '0.0.0.0' || !ipAddress.includes('.')) {
        setIsScanning(false);
        Alert.alert(
          'Wi-Fi Connection Required',
          'Please ensure your phone is connected to a local Wi-Fi network before scanning.',
          [{ text: 'OK' }]
        );
        return;
      }

      const parts = ipAddress.split('.');
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      const found: DiscoveredRouter[] = [];

      const scanIp = async (targetIp: string): Promise<DiscoveredRouter | null> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 700);
        try {
          const res = await fetch(`http://${targetIp}/`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          clearTimeout(timeoutId);
          const body = await res.text();
          const bodyLower = body.toLowerCase();
          if (bodyLower.includes('mikrotik') || bodyLower.includes('routeros') || bodyLower.includes('webfig')) {
            return {
              mac: 'Local LAN',
              ip: targetIp,
              name: targetIp === `${prefix}.1` ? 'Default Gateway Router' : `MikroTik (${targetIp})`,
              platform: 'RouterOS',
              version: 'Detected on LAN'
            };
          }
        } catch (err) {
          clearTimeout(timeoutId);
        }
        return null;
      };

      const ipsToScan: string[] = [];
      ipsToScan.push(`${prefix}.1`);
      ipsToScan.push(`${prefix}.254`);
      for (let i = 2; i < 254; i++) {
        ipsToScan.push(`${prefix}.${i}`);
      }

      const batchSize = 35;
      for (let i = 0; i < ipsToScan.length; i += batchSize) {
        const currentBatch = ipsToScan.slice(i, i + batchSize);
        const results = await Promise.all(currentBatch.map(targetIp => scanIp(targetIp)));
        for (const r of results) {
          if (r) {
            found.push(r);
          }
        }
      }

      setIsScanning(false);
      if (found.length > 0) {
        setDiscoveredRouters(found);
        if (found.length === 1) {
          selectDiscoveredRouter(found[0]);
        } else {
          setIsDiscoveredListVisible(true);
        }
      } else {
        Alert.alert(
          'No Routers Found',
          `No MikroTik routers were detected on subnet ${prefix}.0/24. Please ensure the router is powered on, connected to the same Wi-Fi, and HTTP Webfig service is enabled on port 80.`,
          [{ text: 'OK' }]
        );
      }
    } catch (err: any) {
      setIsScanning(false);
      Alert.alert('Scan Error', err.message || 'An error occurred while scanning the local network.');
    }
  };

  const selectDiscoveredRouter = (dev: DiscoveredRouter) => {
    setIsDiscoveredListVisible(false);
    
    setEditingRouterId(null);
    setDeviceName(dev.name);
    setIp(dev.ip);
    setUser('admin');
    setPass('');
    setWifiName('WI-FI ACCESS');
    
    setVpnIp('10.88.0.1');
    setWgClientPrivateKey('');
    setWgClientIp('10.88.0.2/24');
    setWgServerPublicKey('');
    setWgEndpointHost('');
    setWgEndpointPort('13231');
    setWgAllowedIps('0.0.0.0/0');
    setIsWgSectionExpanded(false);
    setShowAdvancedWg(false);

    setCurrentView('form');
  };

  const handleAddNewClick = () => {
    setIsAddDrawerOpen(true);
  };

  const handleEditRouter = (router: RouterConfig) => {
    setEditingRouterId(router.id || null);
    setDeviceName(router.name || '');
    setIp(router.ip);
    setUser(router.user);
    setPass(router.pass);
    setWifiName(router.wifiName || 'WI-FI ACCESS');
    setVpnIp(router.vpnIp || '10.88.0.1');
    setWgClientPrivateKey(router.wgClientPrivateKey || '');
    setWgClientIp(router.wgClientIp || '10.88.0.2/24');
    setWgServerPublicKey(router.wgServerPublicKey || '');
    setWgEndpointHost(router.wgEndpointHost || '');
    setWgEndpointPort(router.wgEndpointPort || '13231');
    setWgAllowedIps(router.wgAllowedIps || '0.0.0.0/0');
    setIsWgSectionExpanded(!!router.wgClientPrivateKey);
    setShowAdvancedWg(!!router.wgClientPrivateKey);
    setCurrentView('form');
  };

  const handleSaveRouter = async () => {
    if (!ip || !user) {
      Alert.alert('Error', 'IP Address and Username are required');
      return;
    }

    if (editingRouterId) {
      const existing = savedRouters.find(r => r.id === editingRouterId);
      const updated = savedRouters.map(r => r.id === editingRouterId ? {
        id: editingRouterId,
        name: (deviceName || ip).trim(),
        ip: ip.trim(),
        user: user.trim(),
        pass,
        wifiName: wifiName.trim(),
        vpnIp: vpnIp.trim(),
        wgClientPrivateKey: sanitizeBase64Key(wgClientPrivateKey),
        wgClientIp: wgClientIp.trim(),
        wgServerPublicKey: sanitizeBase64Key(wgServerPublicKey),
        wgEndpointHost: wgEndpointHost.trim(),
        wgEndpointPort: wgEndpointPort.trim(),
        wgAllowedIps: wgAllowedIps.trim(),
        useVpn: existing ? existing.useVpn : false
      } : r);
      await onUpdateSavedRouters(updated);
      Alert.alert('Success', 'Router configuration updated!');
    } else {
      const newId = Date.now().toString();
      const newConfig: RouterConfig = {
        id: newId,
        name: (deviceName || ip).trim(),
        ip: ip.trim(),
        user: user.trim(),
        pass,
        wifiName: wifiName.trim(),
        vpnIp: vpnIp.trim(),
        wgClientPrivateKey: sanitizeBase64Key(wgClientPrivateKey),
        wgClientIp: wgClientIp.trim(),
        wgServerPublicKey: sanitizeBase64Key(wgServerPublicKey),
        wgEndpointHost: wgEndpointHost.trim(),
        wgEndpointPort: wgEndpointPort.trim(),
        wgAllowedIps: wgAllowedIps.trim(),
        useVpn: false
      };
      const updated = [...savedRouters, newConfig];
      await onUpdateSavedRouters(updated);
      Alert.alert('Success', 'New router profile added!');
    }

    setCurrentView('list');
    setEditingRouterId(null);
  };

  const handleDeleteRouter = (router: RouterConfig) => {
    Alert.alert(
      'Delete Router',
      `Are you sure you want to remove "${router.name || router.ip}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const updated = savedRouters.filter(r => r.id !== router.id);
            await onUpdateSavedRouters(updated);
          }
        }
      ]
    );
  };

  const handleConnect = async (router: RouterConfig, useVpn: boolean) => {
    abortConnectionRef.current = false;
    setConnectingRouterId(router.id || null);
    setConnectingMode(useVpn ? 'VPN' : 'LOCAL');
    try {
      const success = await onConnectRouter(router, useVpn, () => abortConnectionRef.current);
      if (!success && !abortConnectionRef.current) {
        Alert.alert('Connection Failed', `Could not reach the router via ${useVpn ? 'VPN' : 'Local Access'}. Please verify connection settings.`);
      }
    } catch (err: any) {
      if (!abortConnectionRef.current) {
        Alert.alert('Connection Error', err.message || 'An unexpected error occurred during connection.');
      }
    } finally {
      setConnectingRouterId(null);
      setConnectingMode(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await GoogleSignin.signOut();
    } catch (e) {}
    try {
      await signOut(getAuth());
    } catch (e) {}
  };

  const renderFormContent = () => {
    return (
      <View style={{ flex: 1 }}>
        {/* Custom Header with Back Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 20 }}>
          <TouchableOpacity 
            onPress={() => {
              setCurrentView('list');
              setEditingRouterId(null);
            }} 
            style={{ 
              width: 38, 
              height: 38, 
              borderRadius: 12, 
              backgroundColor: colors.cardBg, 
              alignItems: 'center', 
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: colors.glassBorder
            }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.foreground }}>
              {editingRouterId ? 'Edit Router Profile' : 'New Router Profile'}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>Configure access and credentials</Text>
          </View>
        </View>

        {isZeroTouchLoading && (
          <View style={{ padding: 16, backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '600', textAlign: 'center' }}>{zeroTouchStatus}</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* General Router Settings Card */}
          <View style={{
            backgroundColor: colors.cardBg,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            padding: 16,
            marginBottom: 16,
            gap: 14
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.glassBorder, paddingBottom: 8 }}>
              General Settings
            </Text>

            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Device Label</Text>
              <TextInput 
                style={{ height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground }} 
                value={deviceName} 
                onChangeText={setDeviceName} 
                placeholder="e.g. Home Router, Office Router" 
                placeholderTextColor={colors.textMuted} 
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>IP Address</Text>
                <TextInput 
                  style={{ height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground }} 
                  value={ip} 
                  onChangeText={setIp} 
                  placeholder="192.168.88.1" 
                  placeholderTextColor={colors.textMuted} 
                  keyboardType="url" 
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Wi-Fi SSID</Text>
                <TextInput 
                  style={{ height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground }} 
                  value={wifiName} 
                  onChangeText={setWifiName} 
                  placeholder="Local Wifi Name" 
                  placeholderTextColor={colors.textMuted} 
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Username</Text>
                <TextInput 
                  style={{ height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground }} 
                  value={user} 
                  onChangeText={setUser} 
                  placeholder="admin" 
                  placeholderTextColor={colors.textMuted} 
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Password</Text>
                <TextInput 
                  style={{ height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground }} 
                  value={pass} 
                  onChangeText={setPass} 
                  secureTextEntry 
                  placeholder="••••••••" 
                  placeholderTextColor={colors.textMuted} 
                  autoCapitalize="none"
                />
              </View>
            </View>
          </View>

          {/* WireGuard VPN Settings Card */}
          <View style={{
            backgroundColor: colors.cardBg,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            padding: 16,
            marginBottom: 16,
            gap: 14
          }}>
            <TouchableOpacity 
              onPress={() => setIsWgSectionExpanded(!isWgSectionExpanded)}
              style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                paddingBottom: isWgSectionExpanded ? 8 : 0,
                borderBottomWidth: isWgSectionExpanded ? 1 : 0,
                borderBottomColor: colors.glassBorder
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>
                  WireGuard VPN (Optional)
                </Text>
              </View>
              <Ionicons name={isWgSectionExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {isWgSectionExpanded && (
              <View style={{ gap: 14, marginTop: 4 }}>
                {/* Auto Config Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.primary,
                    paddingVertical: 12,
                    borderRadius: 12,
                    gap: 8,
                  }}
                  onPress={handleZeroTouch}
                >
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Auto-Configure VPN on Router</Text>
                </TouchableOpacity>

                {/* Import Buttons Row */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.secondary,
                      borderWidth: 1.5,
                      borderColor: colors.glassBorder,
                      paddingVertical: 10,
                      borderRadius: 10,
                      gap: 6,
                    }}
                    onPress={handleImportFromClipboard}
                  >
                    <Ionicons name="clipboard-outline" size={14} color={colors.foreground} />
                    <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>Clipboard</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.secondary,
                      borderWidth: 1.5,
                      borderColor: colors.glassBorder,
                      paddingVertical: 10,
                      borderRadius: 10,
                      gap: 6,
                    }}
                    onPress={() => {
                      setImportText('');
                      setIsImportTextModalVisible(true);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={14} color={colors.foreground} />
                    <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>Paste Text</Text>
                  </TouchableOpacity>
                </View>

                {/* Advanced toggle button */}
                <TouchableOpacity 
                  onPress={() => setShowAdvancedWg(!showAdvancedWg)}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginTop: 4,
                    paddingVertical: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>
                    {showAdvancedWg ? 'HIDE MANUAL DETAILS' : 'SHOW ADVANCED/MANUAL CONFIG'}
                  </Text>
                  <Ionicons 
                    name={showAdvancedWg ? "chevron-up" : "chevron-down"} 
                    size={12} 
                    color={colors.textMuted} 
                    style={{ marginLeft: 4 }} 
                  />
                </TouchableOpacity>

                {/* Manual Connection Inputs */}
                {showAdvancedWg && (
                  <View style={{ gap: 14, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>VPN Router IP</Text>
                        <TextInput 
                          style={{ height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                          value={vpnIp}
                          onChangeText={setVpnIp}
                          placeholder="10.88.0.1"
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                      <View style={{ flex: 1.2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Client Tunnel IP</Text>
                        <TextInput 
                          style={{ height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                          value={wgClientIp}
                          onChangeText={setWgClientIp}
                          placeholder="10.88.0.2/24"
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1.2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Endpoint DDNS / IP</Text>
                        <TextInput 
                          style={{ height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                          value={wgEndpointHost}
                          onChangeText={setWgEndpointHost}
                          placeholder="ddns.mynetname.net"
                          placeholderTextColor={colors.textMuted}
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={{ flex: 0.8 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Endpoint Port</Text>
                        <TextInput 
                          style={{ height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                          value={wgEndpointPort}
                          onChangeText={setWgEndpointPort}
                          placeholder="13231"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Server Public Key</Text>
                      <TextInput 
                        style={{ height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 11, color: colors.foreground }}
                        value={wgServerPublicKey}
                        onChangeText={setWgServerPublicKey}
                        placeholder="Base64 Server Public Key"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                      />
                    </View>

                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Client Private Key</Text>
                      <TextInput 
                        style={{ height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 11, color: colors.foreground }}
                        value={wgClientPrivateKey}
                        onChangeText={setWgClientPrivateKey}
                        placeholder="Base64 Client Private Key"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Form Actions Footer Row */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity 
              style={{ 
                flex: 1, 
                height: 48, 
                borderRadius: 14, 
                alignItems: 'center', 
                justifyContent: 'center', 
                backgroundColor: colors.secondary,
                borderWidth: 1.5,
                borderColor: colors.glassBorder
              }} 
              onPress={() => {
                setCurrentView('list');
                setEditingRouterId(null);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ 
                flex: 1.5, 
                height: 48, 
                borderRadius: 14, 
                alignItems: 'center', 
                justifyContent: 'center', 
                backgroundColor: colors.primary 
              }} 
              onPress={handleSaveRouter}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                {editingRouterId ? 'Save Changes' : 'Create Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Text Paste Config Overlay Modal */}
        <Modal
          visible={isImportTextModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsImportTextModalVisible(false)}
        >
          <View style={{
            flex: 1,
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            padding: 20
          }}>
            <View style={{ 
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: colors.glassBorder,
              backgroundColor: colors.cardBg,
              padding: 16
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>
                  Paste Configuration Profile
                </Text>
                <TouchableOpacity onPress={() => setIsImportTextModalVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={18} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={{
                  height: 150,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: colors.glassBorder,
                  backgroundColor: colors.inputBg,
                  padding: 12,
                  fontSize: 12,
                  color: colors.foreground,
                  textAlignVertical: 'top',
                  marginBottom: 16
                }}
                multiline
                value={importText}
                onChangeText={setImportText}
                placeholder="Paste your .conf or Back to Home profile content here..."
                placeholderTextColor={colors.textMuted}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity 
                  style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }} 
                  onPress={() => setIsImportTextModalVisible(false)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }} 
                  onPress={() => {
                    const imported = handleImportWgConf(importText);
                    if (imported) {
                      setIsImportTextModalVisible(false);
                    }
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Import</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderSettingsContent = () => {
    return (
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 15, marginBottom: 25 }}>
          <TouchableOpacity 
            onPress={() => setIsSettingsOpen(false)}
            style={{ 
              width: 38, 
              height: 38, 
              borderRadius: 12, 
              backgroundColor: colors.cardBg, 
              alignItems: 'center', 
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: colors.glassBorder
            }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.foreground, letterSpacing: -0.4 }}>Settings</Text>
        </View>

        {/* Content */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Account Card */}
          <View style={[styles.card, { padding: 16, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16, borderRadius: 16 }]}>
            <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12, color: colors.textMuted }]}>Account</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.secondary,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                  {getAuth().currentUser?.displayName || 'Operator'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                  {getAuth().currentUser?.email || 'No email'}
                </Text>
              </View>
            </View>
            
            <TouchableOpacity
              onPress={handleSignOut}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: '#ef444415',
                borderWidth: 1.5,
                borderColor: '#ef444430'
              }}
            >
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#ef4444' }}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* Theme Preference Card */}
          <View style={[styles.card, { padding: 16, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16, borderRadius: 16 }]}>
            <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12, color: colors.textMuted }]}>Preferences</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: colors.cardBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.2,
                  borderColor: colors.glassBorder
                }}>
                  <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={18} color={colors.foreground} />
                </View>
                <View>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '500' }}>Dark Mode</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Toggle dark and light visual themes</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={toggleTheme}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: colors.primary + '15',
                  borderWidth: 1.2,
                  borderColor: colors.primary
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                  {mode === 'dark' ? 'Disable' : 'Enable'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Backend Server URL Card */}
          <View style={[styles.card, { padding: 16, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16, borderRadius: 16 }]}>
            <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12, color: colors.textMuted }]}>Backend Server</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>Configure the URL of the backend server that manages your routers:</Text>
            
            <TextInput
              value={tempServerUrl}
              onChangeText={setTempServerUrl}
              placeholder="http://192.168.1.100:3000"
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.inputBg,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                marginBottom: 12
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            
            <TouchableOpacity
              onPress={handleSaveServerUrl}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Save Server URL</Text>
            </TouchableOpacity>
          </View>

          {/* Info Card */}
          <View style={[styles.card, { padding: 16, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16, borderRadius: 16 }]}>
            <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12, color: colors.textMuted }]}>Application</Text>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Version</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>1.0.0 (Expo)</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Platform</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>Android</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  // List View Rendering
  const { width: SCREEN_WIDTH } = Dimensions.get('window');

  const formTranslateX = formAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0]
  });

  const settingsTranslateX = settingsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0]
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: Math.max(insets.top, 10), flex: 1 }]}>
      {/* Brand Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4
          }}>
            <Ionicons name="ticket" size={22} color="#fff" />
          </View>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.foreground, letterSpacing: -0.4 }}>HotSpot</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: -2 }}>Manager</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity 
            onPress={toggleTheme} 
            style={{ 
              width: 38, 
              height: 38, 
              borderRadius: 12, 
              backgroundColor: colors.cardBg, 
              alignItems: 'center', 
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: colors.glassBorder
            }}
          >
            <Ionicons name={mode === 'dark' ? 'sunny' : 'moon'} size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setIsSettingsOpen(true)} 
            style={{ 
              width: 38, 
              height: 38, 
              borderRadius: 12, 
              backgroundColor: colors.cardBg, 
              alignItems: 'center', 
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: colors.glassBorder
            }}
          >
            <Ionicons name="settings-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>



      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.foreground, letterSpacing: -0.4, marginBottom: 15 }}>Select a Router Profile</Text>



      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {savedRouters.length === 0 ? (
          <View style={{ padding: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1.5, borderColor: colors.glassBorder, marginTop: 10 }}>
            <Ionicons name="wifi-outline" size={36} color={colors.textMuted} />
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 12, textAlign: 'center', fontWeight: '500' }}>No routers added yet.</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 16 }}>Click "Add Router Profile" at the bottom to configure access details.</Text>
          </View>
        ) : (
          savedRouters.map((router, index) => {
            const isConnectingThis = connectingRouterId === router.id;
            const status = routerStatuses[router.id || ''];

            return (
              <View 
                key={router.id || index} 
                style={{
                  backgroundColor: colors.cardBg,
                  borderRadius: 12,
                  borderWidth: 1.2,
                  borderColor: colors.glassBorder,
                  padding: 12,
                  marginBottom: 10,
                  gap: 10
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.foreground, letterSpacing: -0.3 }}>
                      {router.name || 'MikroTik Router'}
                    </Text>
                    
                    {/* Compact Status Badge */}
                    {status ? (
                      <View style={{ 
                        paddingHorizontal: 6, 
                        paddingVertical: 1.5, 
                        borderRadius: 6, 
                        backgroundColor: status.status === 'online' ? '#22c55e12' : '#ef444412',
                        borderWidth: 1,
                        borderColor: status.status === 'online' ? '#22c55e25' : '#ef444425',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <View style={{ 
                          width: 5, 
                          height: 5, 
                          borderRadius: 2.5, 
                          backgroundColor: status.status === 'online' ? '#22c55e' : '#ef4444' 
                        }} />
                        <Text style={{ 
                          fontSize: 9, 
                          fontWeight: '700', 
                          color: status.status === 'online' ? '#22c55e' : '#ef4444',
                          textTransform: 'uppercase'
                        }}>
                          {status.status}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <ActivityIndicator size="small" color={colors.textMuted} style={{ transform: [{ scale: 0.5 }] }} />
                        <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '500' }}>Checking...</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {!router.isCloudManaged && (
                      <>
                        <TouchableOpacity 
                          disabled={isConnectingThis}
                          onPress={() => handleEditRouter(router)} 
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder }}
                        >
                          <Ionicons name="pencil-outline" size={14} color={colors.foreground} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          disabled={isConnectingThis}
                          onPress={() => handleDeleteRouter(router)} 
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#ef444410', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ef444420' }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#ef4444" />
                        </TouchableOpacity>
                      </>
                    )}
                    {router.isCloudManaged && (
                      <View style={{
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 6,
                        backgroundColor: '#3b82f615',
                        borderWidth: 1,
                        borderColor: '#3b82f630',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <Ionicons name="cloud-outline" size={10} color="#3b82f6" />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#3b82f6' }}>CLOUD</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Telemetry Stats Grid (only when online) - Extremely Compact Row */}
                {status && status.status === 'online' && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingTop: 6,
                    borderTopWidth: 1,
                    borderTopColor: colors.glassBorder
                  }}>
                    {/* Active Users */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      backgroundColor: colors.inputBg,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: colors.glassBorder,
                    }}>
                      <Ionicons name="people-outline" size={10} color={colors.textMuted} />
                      <Text style={{ fontSize: 9, color: colors.foreground, fontWeight: '700' }}>
                        {status.activeUsers} <Text style={{ color: colors.textMuted, fontWeight: '400', fontSize: 8 }}>online</Text>
                      </Text>
                    </View>

                    {/* CPU Load */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      backgroundColor: colors.inputBg,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: colors.glassBorder,
                    }}>
                      <Ionicons name="pulse-outline" size={10} color={colors.textMuted} />
                      <Text style={{ fontSize: 9, color: colors.foreground, fontWeight: '700' }}>
                        {status.cpuLoad !== null ? `${status.cpuLoad}%` : 'N/A'} <Text style={{ color: colors.textMuted, fontWeight: '400', fontSize: 8 }}>CPU</Text>
                      </Text>
                    </View>

                    {/* RAM Usage */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      backgroundColor: colors.inputBg,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: colors.glassBorder,
                    }}>
                      <Ionicons name="hardware-chip-outline" size={10} color={colors.textMuted} />
                      <Text style={{ fontSize: 9, color: colors.foreground, fontWeight: '700' }}>
                        {status.totalMemory && status.freeMemory ? (
                          `${Math.round((status.totalMemory - status.freeMemory) / (1024 * 1024))}/${Math.round(status.totalMemory / (1024 * 1024))}MB`
                        ) : (
                          'N/A'
                        )}
                      </Text>
                    </View>

                    {/* Uptime */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      backgroundColor: colors.inputBg,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: colors.glassBorder,
                    }}>
                      <Ionicons name="time-outline" size={10} color={colors.textMuted} />
                      <Text style={{ fontSize: 9, color: colors.foreground, fontWeight: '700' }} numberOfLines={1} ellipsizeMode="tail">
                        {formatUptimeAPI(status.uptime)}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: 8 }}>
                  {router.isCloudManaged ? (
                    <TouchableOpacity 
                      disabled={isConnectingThis}
                      onPress={() => handleConnect(router, false)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.primary,
                        paddingVertical: 10,
                        borderRadius: 8,
                        gap: 6,
                        opacity: isConnectingThis ? 0.6 : 1,
                      }}
                    >
                      <Ionicons name="cloud" size={13} color="#fff" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Connect via Server</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity 
                        disabled={isConnectingThis}
                        onPress={() => handleConnect(router, false)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.secondary,
                          paddingVertical: 8,
                          borderRadius: 8,
                          gap: 6,
                          borderWidth: 1,
                          borderColor: colors.glassBorder
                        }}
                      >
                        <Ionicons name="wifi" size={12} color={colors.foreground} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.foreground }}>Local Access</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        disabled={isConnectingThis}
                        onPress={() => handleConnect(router, true)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.primary,
                          paddingVertical: 8,
                          borderRadius: 8,
                          gap: 6
                        }}
                      >
                        <Ionicons name="shield-checkmark" size={12} color="#fff" />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>VPN Access</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}

      </ScrollView>

      <TouchableOpacity
        onPress={handleAddNewClick}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary,
          borderRadius: 16,
          paddingVertical: 16,
          gap: 8,
          marginTop: 10,
          marginBottom: Math.max(insets.bottom, 16),
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4
        }}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Add Router Profile</Text>
      </TouchableOpacity>

      {connectingRouterId !== null && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <View style={{
            width: '80%',
            backgroundColor: colors.cardBg,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.5,
            shadowRadius: 15,
            elevation: 10
          }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.primary + '15',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
            
            <Text style={{
              fontSize: 16,
              fontWeight: '800',
              color: colors.foreground,
              textAlign: 'center',
              marginBottom: 4
            }}>
              Connecting to Router
            </Text>
            
            <Text style={{
              fontSize: 14,
              fontWeight: '700',
              color: colors.primary,
              textAlign: 'center',
              marginBottom: 12
            }}>
              {savedRouters.find(r => r.id === connectingRouterId)?.name || 'MikroTik Router'}
            </Text>

            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.secondary,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.glassBorder
            }}>
              <Ionicons 
                name={connectingMode === 'VPN' ? "shield-checkmark" : "wifi-outline"} 
                size={14} 
                color={connectingMode === 'VPN' ? '#22c55e' : colors.primary} 
              />
              <Text style={{ 
                fontSize: 11, 
                fontWeight: '600', 
                color: colors.textMuted 
              }}>
                {connectingMode === 'VPN' ? 'Securing via WireGuard VPN' : 'Direct Local Connection'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                abortConnectionRef.current = true;
                setConnectingRouterId(null);
                setConnectingMode(null);
              }}
              activeOpacity={0.7}
              style={{
                marginTop: 20,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#ef4444' + '15',
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderWidth: 1.2,
                borderColor: '#ef4444' + '35',
                gap: 6
              }}
            >
              <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#ef4444' }}>Stop Connecting</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Form View Overlay */}
      {formVisible && (
        <Animated.View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.background,
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top, 20),
          transform: [{ translateX: formTranslateX }],
          zIndex: 100
        }}>
          {renderFormContent()}
        </Animated.View>
      )}

      {/* Settings View Overlay */}
      {settingsVisible && (
        <Animated.View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.background,
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top, 10),
          transform: [{ translateX: settingsTranslateX }],
          zIndex: 100
        }}>
          {renderSettingsContent()}
        </Animated.View>
      )}

      {/* Bottom Sheet Drawer for adding router */}
      <Modal
        visible={isAddDrawerOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsAddDrawerOpen(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-end',
        }}>
          {/* Backdrop Touch to Close */}
          <TouchableOpacity 
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setIsAddDrawerOpen(false)}
          />
          
          <View style={{
            backgroundColor: colors.cardBg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            borderBottomWidth: 0,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 20) + 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -10 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 20,
          }}>
            {/* Drag Handle */}
            <View style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.textMuted,
              opacity: 0.3,
              alignSelf: 'center',
              marginBottom: 16
            }} />

            <Text style={{
              fontSize: 15,
              fontWeight: '800',
              color: colors.foreground,
              textAlign: 'center',
              marginBottom: 20
            }}>
              Add New Router Profile
            </Text>

            <View style={{ gap: 12 }}>
              {/* Auto Scan Option */}
              <TouchableOpacity
                onPress={handleAutoScan}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.secondary,
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1.2,
                  borderColor: colors.glassBorder,
                  gap: 14
                }}
              >
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: colors.primary + '12',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Ionicons name="scan-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>Auto Scan & Add</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Scan the local Wi-Fi network to detect routers automatically</Text>
                </View>
              </TouchableOpacity>

              {/* Manual Add Option */}
              <TouchableOpacity
                onPress={() => {
                  setIsAddDrawerOpen(false);
                  setEditingRouterId(null);
                  setDeviceName('');
                  setIp('192.168.1.56');
                  setUser('admin');
                  setPass('');
                  setWifiName('WI-FI ACCESS');
                  setVpnIp('10.88.0.1');
                  setWgClientPrivateKey('');
                  setWgClientIp('10.88.0.2/24');
                  setWgServerPublicKey('');
                  setWgEndpointHost('');
                  setWgEndpointPort('13231');
                  setWgAllowedIps('0.0.0.0/0');
                  setIsWgSectionExpanded(false);
                  setShowAdvancedWg(false);
                  setCurrentView('form');
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.secondary,
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1.2,
                  borderColor: colors.glassBorder,
                  gap: 14
                }}
              >
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: colors.primary + '12',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>Manual Configuration</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Enter the IP, credentials, and WireGuard details manually</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setIsAddDrawerOpen(false)}
              style={{
                alignSelf: 'center',
                marginTop: 20,
                padding: 8
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanning Overlay */}
      {isScanning && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000
        }}>
          <View style={{
            backgroundColor: colors.cardBg,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            padding: 24,
            alignItems: 'center',
            gap: 16,
            width: '80%'
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>Scanning local network...</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>Searching for MikroTik routers via MNDP</Text>
          </View>
        </View>
      )}

      {/* Discovered Routers List Modal */}
      {isDiscoveredListVisible && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: 20
        }}>
          <View style={{
            backgroundColor: colors.cardBg,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            padding: 20,
            width: '100%',
            maxHeight: '80%',
            gap: 16
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.foreground }}>Discovered Routers</Text>
              <TouchableOpacity onPress={() => setIsDiscoveredListVisible(false)}>
                <Ionicons name="close" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {discoveredRouters.map((dev, idx) => (
                <TouchableOpacity
                  key={dev.mac || idx}
                  onPress={() => selectDiscoveredRouter(dev)}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderWidth: 1,
                    borderColor: colors.glassBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>{dev.name}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>IP: {dev.ip}  |  MAC: {dev.mac}</Text>
                    {dev.version && <Text style={{ fontSize: 9, color: colors.textMuted }}>Version: {dev.version} ({dev.platform})</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setIsDiscoveredListVisible(false)}
              style={{
                backgroundColor: colors.secondary,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: colors.glassBorder
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.foreground }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
