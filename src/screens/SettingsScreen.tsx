import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet, ActivityIndicator, Modal, Switch } from 'react-native';
import { useTheme } from '../ThemeContext';
import { saveConfig, loadConfig, saveSavedRouters, loadSavedRouters, RouterConfig } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';


export default function SettingsScreen({ 
  onSave,
  activeRouter,
  setActiveRouter
}: { 
  onSave?: () => void;
  activeRouter: RouterConfig | null;
  setActiveRouter: (router: RouterConfig | null) => void;
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

  useEffect(() => {
    (async () => {
      const conf = await loadConfig();
      const routers = await loadSavedRouters();
      
      // Sanitize to ensure every router has a unique id (backward compatibility)
      const sanitized = routers.map((r, idx) => {
        if (!r.id) {
          return { ...r, id: r.ip || `router_${idx}_${Date.now()}` };
        }
        return r;
      });
      if (JSON.stringify(routers) !== JSON.stringify(sanitized)) {
        await saveSavedRouters(sanitized);
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
    })();
  }, []);

  const handleSave = async () => {
    if (!ip || !user) {
      Alert.alert('Error', 'IP Address and Username are required');
      return;
    }


    
    if (editingRouterId) {
      // Edit Mode - update existing router in the list
      const updated = savedRouters.map(r => r.id === editingRouterId ? {
        id: editingRouterId,
        name: deviceName || ip,
        ip,
        user,
        pass,
        wifiName
      } : r);
      
      await saveSavedRouters(updated);
      setSavedRouters(updated);
      
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
        name: deviceName || ip,
        ip,
        user,
        pass,
        wifiName
      };
      
      const updated = [...savedRouters, newConfig];
      await saveSavedRouters(updated);
      setSavedRouters(updated);
      
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
    Alert.alert('Success', `Switched to ${router.name || router.ip}`);
  };

  const handleAddNewClick = () => {
    setEditingRouterId(null);
    setDeviceName('');
    setIp('');
    setUser('admin');
    setPass('');
    setWifiName('');
    setIsModalVisible(true);
  };

  const handleStartEdit = (router: RouterConfig) => {
    setEditingRouterId(router.id || null);
    setDeviceName(router.name || '');
    setIp(router.ip);
    setUser(router.user);
    setPass(router.pass);
    setWifiName(router.wifiName || '');
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
        await saveSavedRouters(updated);
        setSavedRouters(updated);
        
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
          <View style={[styles.card, { padding: 15, marginBottom: 15 }]}>
            <Text style={[styles.label, { fontSize: 12, marginBottom: 12 }]}>Account</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.secondary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.glassBorder
                }}>
                  <Ionicons name="person-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                    {currentUser.displayName || 'Operator'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {currentUser.email}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleSignOut}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(239, 68, 68, 0.2)'
                }}
              >
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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

        {/* Saved Devices */}
        <View style={[styles.card, { padding: 15, marginBottom: 15 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.label, { fontSize: 12, marginBottom: 0 }]}>Saved Routers</Text>
            <TouchableOpacity 
              onPress={handleAddNewClick}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Add New</Text>
            </TouchableOpacity>
          </View>

          {savedRouters.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Ionicons name="wifi-outline" size={36} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
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
                <TouchableOpacity
                  key={router.id || idx}
                  activeOpacity={0.7}
                  onPress={() => handleSelectRouter(router)}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    backgroundColor: isActive 
                      ? (mode === 'dark' ? 'rgba(6,182,212,0.15)' : 'rgba(8,145,178,0.08)') 
                      : (mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    borderWidth: 1.5,
                    borderColor: isActive ? colors.primary : (mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                    borderLeftWidth: 6,
                    borderLeftColor: isActive ? colors.primary : (mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'),
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {/* Active Indicator */}
                    <Ionicons 
                      name={isActive ? "checkmark-circle" : "ellipse-outline"} 
                      size={22} 
                      color={isActive ? colors.primary : colors.textMuted} 
                    />

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>
                          {router.name || router.ip}
                        </Text>
                        {isActive && (
                          <View style={{
                            backgroundColor: mode === 'dark' ? 'rgba(6,182,212,0.2)' : 'rgba(8,145,178,0.1)',
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: colors.primary,
                          }}>
                            <Text style={{ color: colors.primary, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }}>
                              ACTIVE
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        Local: {router.ip} {router.wifiName ? `• ${router.wifiName}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity 
                      style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: 16, 
                        backgroundColor: mode === 'dark' ? 'rgba(6,182,212,0.15)' : 'rgba(8,145,178,0.08)',
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}
                      onPress={() => handleStartEdit(router)}
                    >
                      <Ionicons name="create-outline" size={14} color={colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: 16, 
                        backgroundColor: 'rgba(239,68,68,0.1)', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}
                      onPress={() => handleDeleteRouter(router)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

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
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: 20
        }}>
          <View style={[styles.card, { 
            padding: 20, 
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 8,
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.label, { fontSize: 16, fontWeight: '700', marginBottom: 0, color: colors.foreground }]}>
                {editingRouterId ? 'Edit Router' : 'Add New Router'}
              </Text>
              <TouchableOpacity onPress={handleCancelEdit} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 15 }}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Device Name (Optional)</Text>
                <TextInput 
                  style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                  value={deviceName} 
                  onChangeText={setDeviceName} 
                  placeholder="e.g. Main Router" 
                  placeholderTextColor={colors.textMuted} 
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>IP Address</Text>
                  <TextInput 
                    style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                    value={ip} 
                    onChangeText={setIp} 
                    placeholder="192.168.1.1" 
                    placeholderTextColor={colors.textMuted} 
                    keyboardType="url" 
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Wi-Fi Name</Text>
                  <TextInput 
                    style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                    value={wifiName} 
                    onChangeText={setWifiName} 
                    placeholder="Wi-Fi Access" 
                    placeholderTextColor={colors.textMuted} 
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Username</Text>
                  <TextInput 
                    style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                    value={user} 
                    onChangeText={setUser} 
                    placeholder="admin" 
                    placeholderTextColor={colors.textMuted} 
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Password</Text>
                  <TextInput 
                    style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                    value={pass} 
                    onChangeText={setPass} 
                    secureTextEntry 
                    placeholder="admin" 
                    placeholderTextColor={colors.textMuted} 
                    autoCapitalize="none"
                  />
                </View>
              </View>


            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={[styles.button, { flex: 1, padding: 12, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.glassBorder, marginTop: 0 }]} 
                onPress={handleCancelEdit}
              >
                <Text style={[styles.buttonText, { fontSize: 14, color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.button, { flex: 1, padding: 12, backgroundColor: colors.primary, marginTop: 0 }]} 
                onPress={handleSave}
              >
                <Text style={[styles.buttonText, { fontSize: 14, color: '#fff' }]}>
                  {editingRouterId ? 'Save' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
