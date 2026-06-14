import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet, ActivityIndicator, Modal, Switch } from 'react-native';
import { useTheme } from '../ThemeContext';
import { 
  saveConfig, 
  loadConfig, 
  saveSavedRouters, 
  loadSavedRouters, 
  syncSavedRoutersToFirestore, 
  loadSavedRoutersFromFirestore, 
  RouterConfig 
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
  enableSystemCloudAPI
} from '../api';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import WireGuard, { compileWgConfig } from '../native/WireGuard';


export default function SettingsScreen({ 
  onSave,
  activeRouter,
  setActiveRouter,
  userEmail
}: { 
  onSave?: () => void;
  activeRouter: RouterConfig | null;
  setActiveRouter: (router: RouterConfig | null) => void;
  userEmail?: string;
}) {
  const { colors, styles, mode, toggleTheme } = useTheme();
  const [deviceName, setDeviceName] = useState('');
  const [ip, setIp] = useState('192.168.1.56');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('admin');
  const [wifiName, setWifiName] = useState('WI-FI ACCESS');

  
  const [savedRouters, setSavedRouters] = useState<RouterConfig[]>([]);
  const [editingRouterId, setEditingRouterId] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [nativeVpnStatus, setNativeVpnStatus] = useState<'UP' | 'DOWN' | 'TOGGLING'>('DOWN');

  // WireGuard Modal Fields
  const [vpnIp, setVpnIp] = useState('10.88.0.1');
  const [wgClientPrivateKey, setWgClientPrivateKey] = useState('');
  const [wgClientIp, setWgClientIp] = useState('10.88.0.2/24');
  const [wgServerPublicKey, setWgServerPublicKey] = useState('');
  const [wgEndpointHost, setWgEndpointHost] = useState('');
  const [wgEndpointPort, setWgEndpointPort] = useState('13231');
  const [wgAllowedIps, setWgAllowedIps] = useState('0.0.0.0/0');
  const [isWgSectionExpanded, setIsWgSectionExpanded] = useState(false);

  // Zero-Touch State
  const [isZeroTouchLoading, setIsZeroTouchLoading] = useState(false);
  const [zeroTouchStatus, setZeroTouchStatus] = useState('');
  const [generatedConfText, setGeneratedConfText] = useState('');
  const [isConfModalOpen, setIsConfModalOpen] = useState(false);
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

  const handleZeroTouchInModal = async () => {
    if (!ip || !user) {
      Alert.alert('Validation Error', 'Please fill in the Router IP, Username, and Password fields first to connect.');
      return;
    }

    setIsZeroTouchLoading(true);
    setZeroTouchStatus('Step 1/6: Checking router IP Cloud DDNS status...');
    try {
      // Temporarily write typed credentials to configuration storage so the API helpers can use them
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

      // Generate temporary interface on router to steal client keys
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

      // Delete the temporary interface
      setZeroTouchStatus('Step 3/6: Cleaning up temporary keys...');
      await deleteWireguardInterfaceAPI(tempIface['.id']);

      // Create the actual server interface
      setZeroTouchStatus('Step 4/6: Creating main WireGuard interface...');
      const serverPort = 13231;
      const serverIfaceName = `wg-vpn`;
      
      const serverExists = allWg.some((x: any) => x.name === serverIfaceName);
      const finalServerName = serverExists ? `wg-vpn-${Date.now()}` : serverIfaceName;

      await createWireguardInterfaceAPI(finalServerName, serverPort);

      const updatedWg = await fetchWireguardInterfacesAPI();
      const serverIface = updatedWg.find((x: any) => x.name === finalServerName);
      if (!serverIface || !serverIface['public-key']) {
        throw new Error('Router failed to generate public key for server interface.');
      }
      const serverPublicKey = serverIface['public-key'];

      // Assign IP address
      setZeroTouchStatus('Step 5/6: Assigning IP address...');
      const serverIp = '10.88.0.1/24';
      await assignWireguardIpAddressAPI(finalServerName, serverIp);

      // Add Peer
      setZeroTouchStatus('Step 6/6: Registering client peer...');
      await addWireguardPeerAPI(
        finalServerName,
        clientPublicKey,
        '',
        serverPort,
        '10.88.0.2/32'
      );

      // Populate form states!
      setVpnIp('10.88.0.1');
      setWgClientPrivateKey(clientPrivateKey);
      setWgClientIp('10.88.0.2/24');
      setWgServerPublicKey(serverPublicKey);
      setWgEndpointHost(endpointHost);
      setWgEndpointPort(String(serverPort));
      setWgAllowedIps('0.0.0.0/0');

      Alert.alert('Configuration Success!', 'WireGuard VPN Server setup completed on the router! The parameters are now populated in your form. Click Add/Save to save this router config.');
    } catch (err: any) {
      Alert.alert('Zero-Touch Setup Failed', err.message || 'An error occurred during automatic setup.');
    } finally {
      setIsZeroTouchLoading(false);
      setZeroTouchStatus('');
      
      // Restore the previously active router in store
      if (activeRouter) {
        await saveConfig(activeRouter);
      }
    }
  };

  const handleShareConfig = async (router: RouterConfig) => {
    if (!router.wgClientPrivateKey) {
      Alert.alert('Error', 'No WireGuard configuration found for this router.');
      return;
    }

    const confText = `[Interface]
PrivateKey = ${router.wgClientPrivateKey}
Address = ${router.wgClientIp || '10.88.0.2/24'}
DNS = ${router.vpnIp || '10.88.0.1'}

[Peer]
PublicKey = ${router.wgServerPublicKey}
Endpoint = ${router.wgEndpointHost}:${router.wgEndpointPort || '13231'}
AllowedIPs = ${router.wgAllowedIps || '0.0.0.0/0'}
PersistentKeepalive = 25`;

    try {
      const filename = `${FileSystem.documentDirectory}${router.name?.replace(/\s+/g, '_') || 'wg'}.conf`;
      await FileSystem.writeAsStringAsync(filename, confText);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename, { mimeType: 'text/plain', dialogTitle: 'Share WireGuard Config' });
      } else {
        await Clipboard.setStringAsync(confText);
        Alert.alert('Copied', 'Sharing is not available. Config copied to clipboard!');
      }
    } catch (err: any) {
      Alert.alert('Share Failed', err.message || 'Could not export config file.');
    }
  };

  const currentUser = getAuth().currentUser;



  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await GoogleSignin.signOut().catch(() => {});
              await signOut(getAuth());
            } catch (error) {
              console.error('Sign Out Error:', error);
            }
          } 
        }
      ]
    );
  };

  const updateSavedRouters = async (updated: RouterConfig[]) => {
    await saveSavedRouters(updated);
    setSavedRouters(updated);
    if (userEmail) {
      await syncSavedRoutersToFirestore(userEmail, updated);
    }
  };

  useEffect(() => {
    (async () => {
      const conf = await loadConfig();
      let routers = await loadSavedRouters();

      if (userEmail) {
        try {
          const firestoreRouters = await loadSavedRoutersFromFirestore(userEmail);
          if (firestoreRouters && firestoreRouters.length > 0) {
            routers = firestoreRouters;
            await saveSavedRouters(routers);
          } else if (routers && routers.length > 0) {
            await syncSavedRoutersToFirestore(userEmail, routers);
          }
        } catch (err) {
          console.warn('Failed to sync saved routers with Firestore on load:', err);
        }
      }
      
      // Sanitize to ensure every router has a unique id (backward compatibility)
      const sanitized = routers.map((r, idx) => {
        if (!r.id) {
          return { ...r, id: r.ip || `router_${idx}_${Date.now()}` };
        }
        return r;
      });
      if (JSON.stringify(routers) !== JSON.stringify(sanitized)) {
        await saveSavedRouters(sanitized);
        if (userEmail) {
          await syncSavedRoutersToFirestore(userEmail, sanitized);
        }
      }
      setSavedRouters(sanitized);

      if (conf) {
        const matched = sanitized.find(
          r => r.id === conf.id || 
               (r.name && conf.name && r.name === conf.name) || 
               (r.ip === conf.ip && r.user === conf.user)
        );
        setActiveRouter(matched || conf);
      }

      try {
        const status = await WireGuard.getStatus();
        setNativeVpnStatus(status);
      } catch (err) {
        console.warn('Could not read native WireGuard status:', err);
      }
    })();
  }, [userEmail]);

  const handleSave = async () => {
    if (!ip || !user) {
      Alert.alert('Error', 'IP Address and Username are required');
      return;
    }

    if (editingRouterId) {
      // Edit Mode - update existing router in the list
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
      
      await updateSavedRouters(updated);
      
      // If the edited router was currently active, update active config as well
      if (activeRouter?.id === editingRouterId) {
        const activeItem = updated.find(r => r.id === editingRouterId);
        if (activeItem) {
          await saveConfig(activeItem);
          setActiveRouter(activeItem);
          if (onSave) onSave();
        }
      }
      
      Alert.alert('Success', 'Router configuration updated!');
    } else {
      // Add Mode - save new router
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
      await updateSavedRouters(updated);
      
      // Automatically select and activate the newly added router
      await saveConfig(newConfig);
      setActiveRouter(newConfig);
      if (onSave) onSave();
      
      Alert.alert('Success', 'New router added and selected!');
    }

    setIsModalVisible(false);
    setEditingRouterId(null);
  };

  const handleSelectRouter = async (router: RouterConfig) => {
    setActiveRouter(router);
    await saveConfig(router);
    if (onSave) onSave();
    Alert.alert('Success', `Switched to ${router.name || router.ip} (${router.useVpn ? 'VPN' : 'Local Access'})`);
  };

  const handleConnectRouter = async (router: RouterConfig, useVpn: boolean) => {
    if (useVpn) {
      if (!router.wgClientPrivateKey || !router.wgServerPublicKey || !router.wgEndpointHost) {
        Alert.alert('VPN Configuration Missing', 'Please edit this router and configure the WireGuard VPN settings first.');
        return;
      }

      const cleanPriv = sanitizeBase64Key(router.wgClientPrivateKey);
      const cleanPub = sanitizeBase64Key(router.wgServerPublicKey);
      const base64KeyRegex = /^[A-Za-z0-9+/]{43}=$/;

      if (!base64KeyRegex.test(cleanPriv)) {
        Alert.alert('Invalid Private Key', `The Client Private Key is not a valid 44-character Base64 key. Value: "${cleanPriv}"`);
        return;
      }
      if (!base64KeyRegex.test(cleanPub)) {
        Alert.alert('Invalid Public Key', `The Server Public Key is not a valid 44-character Base64 key. Value: "${cleanPub}"`);
        return;
      }

      setNativeVpnStatus('TOGGLING');
      try {
        const confText = compileWgConfig({
          privateKey: cleanPriv,
          address: router.wgClientIp || '10.88.0.2/24',
          dns: router.vpnIp || '10.88.0.1',
          publicKey: cleanPub,
          allowedIps: router.wgAllowedIps || '0.0.0.0/0',
          endpoint: `${router.wgEndpointHost}:${router.wgEndpointPort || '13231'}`
        });

        await WireGuard.connect(confText);
        setNativeVpnStatus('UP');
      } catch (err: any) {
        setNativeVpnStatus('DOWN');
        Alert.alert('VPN Connection Failed', err.message || 'Could not establish connection to the WireGuard tunnel.');
        return;
      }
    } else {
      setNativeVpnStatus('TOGGLING');
      try {
        await WireGuard.disconnect();
        setNativeVpnStatus('DOWN');
      } catch (err: any) {
        console.warn('Failed to disconnect VPN:', err);
      }
    }

    const updated = savedRouters.map(r => r.id === router.id ? { ...r, useVpn } : r);
    await updateSavedRouters(updated);

    const target = updated.find(r => r.id === router.id);
    if (target) {
      setActiveRouter(target);
      await saveConfig(target);
      if (onSave) onSave();
      Alert.alert('Connected', `Switched to ${target.name || target.ip} via ${useVpn ? 'VPN' : 'Local Access'}`);
    }
  };

  const handleAddNewClick = () => {
    setEditingRouterId(null);
    setDeviceName('');
    setIp('');
    setUser('admin');
    setPass('');
    setWifiName('');
    setVpnIp('10.88.0.1');
    setWgClientPrivateKey('');
    setWgClientIp('10.88.0.2/24');
    setWgServerPublicKey('');
    setWgEndpointHost('');
    setWgEndpointPort('13231');
    setWgAllowedIps('0.0.0.0/0');
    setIsWgSectionExpanded(false);
    setIsModalVisible(true);
  };

  const handleStartEdit = (router: RouterConfig) => {
    setEditingRouterId(router.id || null);
    setDeviceName(router.name || '');
    setIp(router.ip);
    setUser(router.user);
    setPass(router.pass);
    setWifiName(router.wifiName || '');
    setVpnIp(router.vpnIp || '10.88.0.1');
    setWgClientPrivateKey(router.wgClientPrivateKey || '');
    setWgClientIp(router.wgClientIp || '10.88.0.2/24');
    setWgServerPublicKey(router.wgServerPublicKey || '');
    setWgEndpointHost(router.wgEndpointHost || '');
    setWgEndpointPort(router.wgEndpointPort || '13231');
    setWgAllowedIps(router.wgAllowedIps || '0.0.0.0/0');
    setIsWgSectionExpanded(!!router.wgClientPrivateKey);
    setIsModalVisible(true);
  };

  const handleCancelEdit = () => {
    setIsModalVisible(false);
    setEditingRouterId(null);
  };

  const handleDeleteRouter = (router: RouterConfig) => {
    Alert.alert('Delete', `Remove ${router.name || router.ip}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = savedRouters.filter(r => r.id !== router.id);
        await updateSavedRouters(updated);
        
        // If the deleted router was active, clear active config
        if (activeRouter?.id === router.id) {
          await saveConfig({ ip: '', user: '', pass: '' });
          setActiveRouter(null);
          if (onSave) onSave();
        }
      }}
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

        {/* Account card */}
        {currentUser && (
          <View style={[styles.card, { padding: 12, marginBottom: 16 }]}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 12 }]}>Account</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: colors.secondary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Ionicons name="person-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                    {currentUser.displayName || 'Operator'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                    {currentUser.email}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleSignOut}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: 'rgba(239, 68, 68, 0.06)',
                }}
              >
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '500' }}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Appearance card */}
        <View style={[styles.card, { padding: 14, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16 }]}>
          <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 }]}>Appearance</Text>
          <TouchableOpacity
            onPress={toggleTheme}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons
                name={mode === 'dark' ? 'moon' : 'sunny'}
                size={18}
                color={colors.primary}
              />
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>
                {mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </Text>
            </View>
            <View style={{
              width: 42, height: 24, borderRadius: 12,
              backgroundColor: mode === 'dark' ? colors.primary : colors.textMuted + '33',
              justifyContent: 'center',
              padding: 2,
            }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: '#fff',
                alignSelf: mode === 'dark' ? 'flex-end' : 'flex-start',
              }} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Saved Devices */}
        <View style={[styles.card, { padding: 14, borderWidth: 1.5, borderColor: colors.glassBorder, marginBottom: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 0 }]}>Saved Routers</Text>
            <TouchableOpacity 
              onPress={handleAddNewClick}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Add New</Text>
            </TouchableOpacity>
          </View>

          {savedRouters.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Ionicons name="wifi-outline" size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                No saved routers. Tap "+ Add New" to add one.
              </Text>
            </View>
          ) : (
            savedRouters.map((router, idx) => {
              const isActive = activeRouter && (
                router.id === activeRouter.id || 
                (router.name && activeRouter.name && router.name === activeRouter.name)
              );
              return (
                <View
                  key={router.id || idx}
                  style={{ 
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: colors.secondary,
                    borderWidth: isActive ? 2 : 1.5,
                    borderColor: isActive ? colors.primary : colors.glassBorder,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleSelectRouter(router)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      {/* Active Indicator */}
                      <Ionicons 
                        name={isActive ? "checkmark-circle" : "ellipse-outline"} 
                        size={18} 
                        color={isActive ? colors.primary : colors.textMuted} 
                      />

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>
                            {router.name || router.ip}
                          </Text>
                          {isActive && (
                            <View style={{
                              backgroundColor: router.useVpn ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: router.useVpn ? 'rgba(16, 185, 129, 0.16)' : 'rgba(59, 130, 246, 0.16)'
                            }}>
                              <Text style={{ color: router.useVpn ? '#10b981' : colors.primary, fontSize: 8, fontWeight: '600' }}>
                                {router.useVpn ? 'VPN Active' : 'Local Active'}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                          Local: {router.ip} {router.wifiName ? `• ${router.wifiName}` : ''}
                        </Text>
                        {router.wgClientPrivateKey && (
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                            VPN IP: {router.vpnIp || '10.88.0.1'}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity 
                        style={{ 
                          width: 30, 
                          height: 30, 
                          borderRadius: 8, 
                          backgroundColor: colors.inputBg,
                          alignItems: 'center', 
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: colors.glassBorder
                        }}
                        onPress={() => handleStartEdit(router)}
                      >
                        <Ionicons name="create-outline" size={13} color={colors.primary} />
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={{ 
                          width: 30, 
                          height: 30, 
                          borderRadius: 8, 
                          backgroundColor: 'rgba(239,68,68,0.06)', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: 'rgba(239,68,68,0.12)'
                        }}
                        onPress={() => handleDeleteRouter(router)}
                      >
                        <Ionicons name="trash-outline" size={13} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* VPN / Local Toggles if WireGuard is configured */}
                  {router.wgClientPrivateKey ? (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.glassBorder }}>
                      <TouchableOpacity
                        onPress={() => handleConnectRouter(router, false)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: (!router.useVpn && isActive) ? colors.primary : colors.inputBg,
                          borderWidth: 1,
                          borderColor: colors.glassBorder,
                        }}
                      >
                        <Ionicons name="wifi" size={10} color={(!router.useVpn && isActive) ? '#fff' : colors.textMuted} />
                        <Text style={{ color: (!router.useVpn && isActive) ? '#fff' : colors.foreground, fontSize: 10, fontWeight: '600' }}>Local Access</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleConnectRouter(router, true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: (router.useVpn && isActive) ? colors.primary : colors.inputBg,
                          borderWidth: 1,
                          borderColor: colors.glassBorder,
                        }}
                      >
                        <Ionicons name="shield-checkmark" size={10} color={(router.useVpn && isActive) ? '#fff' : colors.primary} />
                        <Text style={{ color: (router.useVpn && isActive) ? '#fff' : colors.foreground, fontSize: 10, fontWeight: '600' }}>
                          VPN Access {isActive && `(${nativeVpnStatus === 'UP' ? 'Active' : nativeVpnStatus === 'TOGGLING' ? 'Connecting...' : 'Inactive'})`}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleShareConfig(router)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: colors.inputBg,
                          borderWidth: 1,
                          borderColor: colors.glassBorder,
                          marginLeft: 'auto'
                        }}
                      >
                        <Ionicons name="share-outline" size={10} color={colors.foreground} />
                        <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: '600' }}>Export profile</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* Developer Card */}
        <View style={[styles.card, { padding: 12, alignItems: 'center', backgroundColor: colors.secondary }]}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600', marginBottom: 2 }}>
            MK Voucher v1.0.0
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
            © 2026 Developed by Faris Hamad
          </Text>
          
          <View style={{ flexDirection: 'row', gap: 15 }}>
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => Alert.alert('Contact', 'farishmd93@gmail.com')}
            >
              <Ionicons name="mail" size={13} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '500' }}>Email</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => Alert.alert('Contact', '+249966626693')}
            >
              <Ionicons name="call" size={13} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '500' }}>Call</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Modal popup for Add/Edit Router */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelEdit}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          padding: 20
        }}>
          <View style={[styles.card, { 
            padding: 16, 
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            backgroundColor: colors.cardBg
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>
                {editingRouterId ? 'Edit Router' : 'Add New Router'}
              </Text>
              <TouchableOpacity onPress={handleCancelEdit} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 15 }}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Device Name (Optional)</Text>
                <TextInput 
                  style={[styles.input, { height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground, marginBottom: 0 }]} 
                  value={deviceName} 
                  onChangeText={setDeviceName} 
                  placeholder="e.g. Main Router" 
                  placeholderTextColor={colors.textMuted} 
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>IP Address</Text>
                  <TextInput 
                    style={[styles.input, { height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground, marginBottom: 0 }]} 
                    value={ip} 
                    onChangeText={setIp} 
                    placeholder="192.168.1.1" 
                    placeholderTextColor={colors.textMuted} 
                    keyboardType="url" 
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Wi-Fi Name</Text>
                  <TextInput 
                    style={[styles.input, { height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground, marginBottom: 0 }]} 
                    value={wifiName} 
                    onChangeText={setWifiName} 
                    placeholder="Wi-Fi Access" 
                    placeholderTextColor={colors.textMuted} 
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Username</Text>
                  <TextInput 
                    style={[styles.input, { height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground, marginBottom: 0 }]} 
                    value={user} 
                    onChangeText={setUser} 
                    placeholder="admin" 
                    placeholderTextColor={colors.textMuted} 
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Password</Text>
                  <TextInput 
                    style={[styles.input, { height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 12, fontSize: 13, color: colors.foreground, marginBottom: 0 }]} 
                    value={pass} 
                    onChangeText={setPass} 
                    secureTextEntry 
                    placeholder="admin" 
                    placeholderTextColor={colors.textMuted} 
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => setIsWgSectionExpanded(!isWgSectionExpanded)}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  marginTop: 10,
                  borderTopWidth: 1.5,
                  borderTopColor: colors.glassBorder
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>
                    WireGuard VPN Settings
                  </Text>
                </View>
                <Ionicons name={isWgSectionExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
              </TouchableOpacity>

              {isWgSectionExpanded && (
                <View style={{ padding: 12, backgroundColor: colors.secondary, borderRadius: 12, borderWidth: 1.5, borderColor: colors.glassBorder, gap: 10, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.primary,
                      paddingVertical: 10,
                      borderRadius: 10,
                      gap: 6,
                    }}
                    onPress={handleZeroTouchInModal}
                  >
                    <Ionicons name="flash-outline" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Auto-Configure WireGuard</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.inputBg,
                        borderWidth: 1.5,
                        borderColor: colors.glassBorder,
                        paddingVertical: 8,
                        borderRadius: 10,
                        gap: 6,
                      }}
                      onPress={handleImportFromClipboard}
                    >
                      <Ionicons name="clipboard-outline" size={13} color={colors.foreground} />
                      <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>Import Clipboard</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.inputBg,
                        borderWidth: 1.5,
                        borderColor: colors.glassBorder,
                        paddingVertical: 8,
                        borderRadius: 10,
                        gap: 6,
                      }}
                      onPress={() => {
                        setImportText('');
                        setIsImportTextModalVisible(true);
                      }}
                    >
                      <Ionicons name="document-text-outline" size={13} color={colors.foreground} />
                      <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>Paste Config Text</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>VPN Router IP</Text>
                      <TextInput 
                        style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                        value={vpnIp}
                        onChangeText={setVpnIp}
                        placeholder="10.88.0.1"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>Client Tunnel IP</Text>
                      <TextInput 
                        style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                        value={wgClientIp}
                        onChangeText={setWgClientIp}
                        placeholder="10.88.0.2/24"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1.2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>Endpoint Domain/IP</Text>
                      <TextInput 
                        style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                        value={wgEndpointHost}
                        onChangeText={setWgEndpointHost}
                        placeholder="myddns.mynetname.net"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ flex: 0.8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>Endpoint Port</Text>
                      <TextInput 
                        style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 12, color: colors.foreground }}
                        value={wgEndpointPort}
                        onChangeText={setWgEndpointPort}
                        placeholder="13231"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>Server Public Key</Text>
                    <TextInput 
                      style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 11, color: colors.foreground }}
                      value={wgServerPublicKey}
                      onChangeText={setWgServerPublicKey}
                      placeholder="Server Public Key"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>Client Private Key</Text>
                    <TextInput 
                      style={{ height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, paddingHorizontal: 10, fontSize: 11, color: colors.foreground }}
                      value={wgClientPrivateKey}
                      onChangeText={setWgClientPrivateKey}
                      placeholder="Client Private Key"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              )}

            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }} 
                onPress={handleCancelEdit}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }} 
                onPress={handleSave}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>
                  {editingRouterId ? 'Save' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      {/* Generated WireGuard Client Configuration Modal */}
      <Modal
        visible={isConfModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfModalOpen(false)}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          padding: 20
        }}>
          <View style={[styles.card, { 
            padding: 16, 
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            backgroundColor: colors.cardBg
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>
                WireGuard Client Profile
              </Text>
              <TouchableOpacity onPress={() => setIsConfModalOpen(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 16 }}>
              Copy this configuration text or save it as a `.conf` file to import into the WireGuard app on your phone.
            </Text>

            <View style={{ 
              backgroundColor: colors.secondary, 
              borderWidth: 1.5, 
              borderColor: colors.glassBorder, 
              borderRadius: 12, 
              padding: 12, 
              marginBottom: 16 
            }}>
              <ScrollView style={{ maxHeight: 200 }}>
                <Text style={{ 
                  color: colors.foreground, 
                  fontSize: 11, 
                  fontFamily: 'monospace',
                  lineHeight: 15
                }}>
                  {generatedConfText}
                </Text>
              </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }} 
                onPress={() => setIsConfModalOpen(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1.2, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }} 
                onPress={async () => {
                  await Clipboard.setStringAsync(generatedConfText);
                  Alert.alert('Copied', 'Client configuration copied to clipboard!');
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Copy Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Zero-Touch Progress Overlay */}
      <Modal
        visible={isZeroTouchLoading}
        transparent
        animationType="fade"
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: 20
        }}>
          <View style={[styles.card, { 
            padding: 24, 
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            backgroundColor: colors.cardBg,
            alignItems: 'center',
            width: '80%',
            maxWidth: 320,
          }]}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 8, textAlign: 'center' }}>
              Setting up VPN...
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 }}>
              {zeroTouchStatus}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Import WireGuard Config Text Modal */}
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
          <View style={[styles.card, { 
            padding: 16, 
            borderWidth: 1.5,
            borderColor: colors.glassBorder,
            backgroundColor: colors.cardBg
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>
                Paste WireGuard / BTH Config
              </Text>
              <TouchableOpacity onPress={() => setIsImportTextModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 16 }}>
              Paste your standard WireGuard client `.conf` config or BTH settings below to parse and load it.
            </Text>

            <TextInput
              style={{
                height: 180,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: colors.glassBorder,
                backgroundColor: colors.inputBg,
                padding: 10,
                fontSize: 12,
                color: colors.foreground,
                fontFamily: 'monospace',
                textAlignVertical: 'top',
                marginBottom: 16
              }}
              value={importText}
              onChangeText={setImportText}
              placeholder={`[Interface]\nPrivateKey = ...\nAddress = 10.88.0.2/24\n\n[Peer]\nPublicKey = ...\nEndpoint = ...`}
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }} 
                onPress={() => setIsImportTextModalVisible(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1.2, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }} 
                onPress={() => {
                  const ok = handleImportWgConf(importText);
                  if (ok) {
                    setIsImportTextModalVisible(false);
                  }
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Parse & Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
