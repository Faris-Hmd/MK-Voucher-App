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
        <View style={[styles.card, { padding: 12, marginBottom: 16 }]}>
          <Text style={[styles.label, { fontSize: 11, marginBottom: 10 }]}>Appearance</Text>
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
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '500' }}>
                {mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </Text>
            </View>
            <View style={{
              width: 38, height: 22, borderRadius: 11,
              backgroundColor: mode === 'dark' ? colors.primary : colors.secondary,
              justifyContent: 'center',
              padding: 2,
            }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: '#fff',
                alignSelf: mode === 'dark' ? 'flex-end' : 'flex-start',
              }} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Saved Devices */}
        <View style={[styles.card, { padding: 12, marginBottom: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 0 }]}>Saved Routers</Text>
            <TouchableOpacity 
              onPress={handleAddNewClick}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>Add New</Text>
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
                <TouchableOpacity
                  key={router.id || idx}
                  activeOpacity={0.8}
                  onPress={() => handleSelectRouter(router)}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: colors.secondary,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: isActive ? colors.primary : colors.glassBorder,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {/* Active Indicator */}
                    <Ionicons 
                      name={isActive ? "checkmark-circle" : "ellipse-outline"} 
                      size={18} 
                      color={isActive ? colors.primary : colors.textMuted} 
                    />

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '500' }}>
                          {router.name || router.ip}
                        </Text>
                        {isActive && (
                          <View style={{
                            backgroundColor: 'rgba(59, 130, 246, 0.06)',
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 4,
                          }}>
                            <Text style={{ color: colors.primary, fontSize: 8, fontWeight: '500' }}>
                              Active
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
                        width: 30, 
                        height: 30, 
                        borderRadius: 8, 
                        backgroundColor: colors.inputBg,
                        alignItems: 'center', 
                        justifyContent: 'center' 
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
                        justifyContent: 'center' 
                      }}
                      onPress={() => handleDeleteRouter(router)}
                    >
                      <Ionicons name="trash-outline" size={13} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
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
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.label, { fontSize: 15, fontWeight: '600', marginBottom: 0, color: colors.foreground }]}>
                {editingRouterId ? 'Edit Router' : 'Add New Router'}
              </Text>
              <TouchableOpacity onPress={handleCancelEdit} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 15 }}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.label, { fontSize: 11, marginBottom: 6 }]}>Device Name (Optional)</Text>
                <TextInput 
                  style={[styles.input, { height: 38, paddingHorizontal: 12, fontSize: 13, marginBottom: 0 }]} 
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
                    style={[styles.input, { height: 38, paddingHorizontal: 12, fontSize: 13, marginBottom: 0 }]} 
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
                    style={[styles.input, { height: 38, paddingHorizontal: 12, fontSize: 13, marginBottom: 0 }]} 
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
                    style={[styles.input, { height: 38, paddingHorizontal: 12, fontSize: 13, marginBottom: 0 }]} 
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
                    style={[styles.input, { height: 38, paddingHorizontal: 12, fontSize: 13, marginBottom: 0 }]} 
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
                style={[styles.button, { flex: 1, height: 38, justifyContent: 'center', backgroundColor: colors.secondary, marginTop: 0 }]} 
                onPress={handleCancelEdit}
              >
                <Text style={[styles.buttonText, { fontSize: 13, fontWeight: '500', color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.button, { flex: 1, height: 38, justifyContent: 'center', backgroundColor: colors.primary, marginTop: 0 }]} 
                onPress={handleSave}
              >
                <Text style={[styles.buttonText, { fontSize: 13, fontWeight: '500', color: '#fff' }]}>
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
