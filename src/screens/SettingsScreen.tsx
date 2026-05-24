import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../ThemeContext';
import { saveConfig, loadConfig, saveSavedRouters, loadSavedRouters, RouterConfig } from '../store';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen({ onSave }: { onSave?: () => void }) {
  const { colors, styles, mode, toggleTheme } = useTheme();
  const [deviceName, setDeviceName] = useState('');
  const [ip, setIp] = useState('192.168.1.56');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('admin');
  const [wifiName, setWifiName] = useState('WI-FI ACCESS');
  
  const [savedRouters, setSavedRouters] = useState<RouterConfig[]>([]);

  useEffect(() => {
    (async () => {
      const conf = await loadConfig();
      if (conf) {
        if (conf.name) setDeviceName(conf.name);
        setIp(conf.ip);
        setUser(conf.user);
        setPass(conf.pass);
        if (conf.wifiName) setWifiName(conf.wifiName);
      }
      
      const routers = await loadSavedRouters();
      setSavedRouters(routers);
    })();
  }, []);

  const handleSave = async () => {
    if (!ip || !user) {
      Alert.alert('Error', 'IP and User are required');
      return;
    }
    
    const newConfig: RouterConfig = {
      id: ip, // Use IP as ID
      name: deviceName || ip,
      ip,
      user,
      pass,
      wifiName
    };
    
    await saveConfig(newConfig);
    
    let updatedRouters = [...savedRouters];
    const existingIdx = updatedRouters.findIndex(r => r.ip === ip);
    if (existingIdx >= 0) {
      updatedRouters[existingIdx] = newConfig;
    } else {
      updatedRouters.push(newConfig);
    }
    
    await saveSavedRouters(updatedRouters);
    setSavedRouters(updatedRouters);

    if (onSave) onSave();
    Alert.alert('Success', 'Router Configuration Saved!');
  };

  const handleSelectRouter = async (router: RouterConfig) => {
    setDeviceName(router.name || '');
    setIp(router.ip);
    setUser(router.user);
    setPass(router.pass);
    setWifiName(router.wifiName || '');
    
    await saveConfig(router);
    if (onSave) onSave();
    Alert.alert('Success', `Switched to ${router.name || router.ip}`);
  };

  const handleDeleteRouter = (router: RouterConfig) => {
    Alert.alert('Delete', `Remove ${router.name || router.ip}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = savedRouters.filter(r => r.ip !== router.ip);
        await saveSavedRouters(updated);
        setSavedRouters(updated);
      }}
    ]);
  };

  return (
    <ScrollView style={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Appearance card */}
      <View style={[styles.card, { padding: 15, marginBottom: 15 }]}>
        <Text style={[styles.label, { fontSize: 12, marginBottom: 10 }]}>Appearance</Text>
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
              size={20}
              color={colors.primary}
            />
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600' }}>
              {mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </Text>
          </View>
          <View style={{
            width: 44, height: 24, borderRadius: 12,
            backgroundColor: mode === 'dark' ? colors.primary : colors.glassBorder,
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

      {/* Router config card */}
      <View style={[styles.card, { padding: 15, marginBottom: 15 }]}>
        <Text style={[styles.label, { fontSize: 12, marginBottom: 12 }]}>Router Setup</Text>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Device Name (Optional)</Text>
          <TextInput style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} value={deviceName} onChangeText={setDeviceName} placeholder="e.g. Main Router" placeholderTextColor={colors.textMuted} />
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>IP Address</Text>
            <TextInput style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} value={ip} onChangeText={setIp} placeholder="192.168.1.1" placeholderTextColor={colors.textMuted} keyboardType="url" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Wi-Fi Name</Text>
            <TextInput style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} value={wifiName} onChangeText={setWifiName} placeholder="Wi-Fi Access" placeholderTextColor={colors.textMuted} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 15 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Username</Text>
            <TextInput style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} value={user} onChangeText={setUser} placeholder="admin" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Password</Text>
            <TextInput style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} value={pass} onChangeText={setPass} secureTextEntry placeholder="admin" placeholderTextColor={colors.textMuted} />
          </View>
        </View>

        <TouchableOpacity style={[styles.button, { padding: 12, marginTop: 5 }]} onPress={handleSave}>
          <Text style={[styles.buttonText, { fontSize: 14 }]}>Save Setup</Text>
        </TouchableOpacity>
      </View>

      {/* Saved Devices */}
      {savedRouters.length > 0 && (
        <View style={[styles.card, { padding: 15, marginBottom: 15 }]}>
          <Text style={[styles.label, { fontSize: 12, marginBottom: 12 }]}>Saved Devices</Text>
          {savedRouters.map((router, idx) => (
            <View key={idx} style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              paddingVertical: 10,
              borderBottomWidth: idx < savedRouters.length - 1 ? 1 : 0,
              borderBottomColor: colors.glassBorder
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{router.name || router.ip}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{router.ip}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity 
                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primary, borderRadius: 6 }}
                  onPress={() => handleSelectRouter(router)}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Select</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6 }}
                  onPress={() => handleDeleteRouter(router)}
                >
                  <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Developer Card */}
      <View style={[styles.card, { padding: 15, alignItems: 'center', backgroundColor: 'rgba(6,182,212,0.05)' }]}>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
          MK Voucher v1.0.0
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
          © 2026 Developed by Faris Hamad
        </Text>
        
        <View style={{ flexDirection: 'row', gap: 15 }}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => Alert.alert('Contact', 'farishmd93@gmail.com')}
          >
            <Ionicons name="mail" size={14} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontSize: 12 }}>Email</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => Alert.alert('Contact', '+249966626693')}
          >
            <Ionicons name="call" size={14} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontSize: 12 }}>Call</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}
