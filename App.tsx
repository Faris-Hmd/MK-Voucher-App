import React from 'react';
import { requireOptionalNativeModule } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { View, TouchableOpacity, Text, StyleSheet, Modal, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { useState, useEffect, useRef } from 'react';

try {
  const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
  DevMenuPreferences?.setPreferencesAsync({
    showFloatingActionButton: false,
  });
} catch (e) {
  // Ignored in non-dev builds
}

import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import { checkConnectionAPI, fetchSystemResourcesAPI, fetchSystemHealthAPI, fetchActiveSessionsAPI, formatUptimeAPI } from './src/api';
import { loadConfig, saveConfig, saveSavedRouters, loadSavedRouters, RouterConfig } from './src/store';

import { 
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold 
} from '@expo-google-fonts/plus-jakarta-sans';

import GenerateScreen from './src/screens/GenerateScreen';
import ListScreen from './src/screens/ListScreen';
import UsersScreen from './src/screens/UsersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import VoucherProfilesScreen from './src/screens/VoucherProfilesScreen';
import LoginScreen from './src/screens/LoginScreen';
import PendingScreen from './src/screens/PendingScreen';

import PagerView from 'react-native-pager-view';
import { getAuth, onAuthStateChanged, FirebaseAuthTypes } from '@react-native-firebase/auth';

import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from '@react-native-firebase/firestore';

type Tab = 'generate' | 'profiles' | 'list' | 'users' | 'settings';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'generate', label: 'Vouchers',  icon: 'ticket-outline' },
  { key: 'profiles', label: 'Profiles',  icon: 'server-outline' },
  { key: 'list',     label: 'Batch',     icon: 'layers-outline' },
  { key: 'users',    label: 'Users',     icon: 'people-outline' },
  { key: 'settings', label: 'Settings',  icon: 'settings-outline' },
];

const TAB_TITLES: Record<Tab, string> = {
  generate: 'Vouchers',
  profiles: 'Profiles',
  list:     'Batch & Print',
  users:    'Users',
  settings: 'Settings',
};

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [activeRouter, setActiveRouter] = useState<RouterConfig | null>(null);
  const [resources, setResources] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const checkInterval = useRef<any>(null);
  const pagerRef = useRef<PagerView>(null);
  const insets = useSafeAreaInsets();
  const { mode, colors } = useTheme();

  useEffect(() => {
    checkStatus();
  }, [activeRouter?.id]);

  useEffect(() => {
    checkStatus();
    checkInterval.current = setInterval(checkStatus, 60000);
    return () => clearInterval(checkInterval.current);
  }, []);

  useEffect(() => {
    checkStatus();
  }, [activeTab]);

  const checkStatus = async () => {
    try {
      const config = await loadConfig();
      setActiveRouter(config);

      const status = await checkConnectionAPI();
      setIsConnected(status);
      if (status) {
        const [res, h, active] = await Promise.all([
          fetchSystemResourcesAPI(),
          fetchSystemHealthAPI(),
          fetchActiveSessionsAPI().catch(() => [])
        ]);
        setResources(res);
        setHealth(h);
        setOnlineCount(Array.isArray(active) ? active.length : 0);
      } else {
        setResources(null);
        setHealth(null);
        setOnlineCount(0);
      }
    } catch (e) {
      setIsConnected(false);
      setResources(null);
      setHealth(null);
      setOnlineCount(0);
    }
  };



  const getTemperature = () => {
    if (!health) return null;
    if (Array.isArray(health)) {
      const t = health.find(i => i.name === 'temperature' || i.name === 'cpu-temperature');
      return t ? t.value : null;
    }
    return health.temperature || health['cpu-temperature'];
  };

  const handleTabPress = (key: Tab, index: number) => {
    setActiveTab(key);
    pagerRef.current?.setPage(index);
  };

  const handlePageSelected = (e: any) => {
    const index = e.nativeEvent.position;
    setActiveTab(tabs[index].key);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomWidth: 0, paddingBottom: 4 }]}>
        {/* Left Side: Logo & Page Name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Ionicons name="ticket" size={20} color="#fff" />
          </View>
          <View style={{ justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground, letterSpacing: -0.3 }}>HotSpot Manager</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500', marginTop: 1 }}>{TAB_TITLES[activeTab]}</Text>
          </View>
        </View>

        {/* Right Side: Active Profile Name & Status Dot */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isConnected ? '#22c55e' : '#ef4444' }} />
          <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500' }}>
            <Text style={{ color: colors.foreground }}>{activeRouter ? (activeRouter.name || activeRouter.ip) : 'router'}</Text>
            {isConnected && resources?.['board-name'] ? ` (${resources['board-name']})` : ''}
          </Text>
        </View>
      </View>

      {/* Status Line */}
      {isConnected && resources ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 10 }}>
          {/* Bottom Line: Status info chips (RAM, CPU, Uptime, Temp) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="hardware-chip-outline" size={11} color={colors.textMuted} />
              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                RAM: <Text style={{ color: colors.foreground }}>{Math.round((parseInt(resources['total-memory']) - parseInt(resources['free-memory'])) / (1024 * 1024))}/{Math.round(parseInt(resources['total-memory']) / (1024 * 1024))}MB</Text>
              </Text>
            </View>

            {resources['cpu-load'] !== undefined && resources['cpu-load'] !== null && (
              <>
                <Text style={{ fontSize: 11, color: colors.glassBorder }}>|</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="pulse-outline" size={11} color={colors.textMuted} />
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    CPU: <Text style={{ color: colors.foreground }}>{resources['cpu-load']}%</Text>
                  </Text>
                </View>
              </>
            )}

            <Text style={{ fontSize: 11, color: colors.glassBorder }}>|</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="time-outline" size={11} color={colors.textMuted} />
              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                <Text style={{ color: colors.foreground }}>{formatUptimeAPI(resources['uptime'])}</Text>
              </Text>
            </View>

            {getTemperature() !== null && getTemperature() !== undefined && (
              <>
                <Text style={{ fontSize: 11, color: colors.glassBorder }}>|</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="thermometer-outline" size={11} color={colors.textMuted} />
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    <Text style={{ color: colors.foreground }}>{getTemperature()}°C</Text>
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      ) : null}

      {/* Swipeable Main content */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
      >
        <View key="1"><GenerateScreen /></View>
        <View key="2"><VoucherProfilesScreen /></View>
        <View key="3"><ListScreen /></View>
        <View key="4"><UsersScreen /></View>
        <View key="5">
          <SettingsScreen 
            onSave={checkStatus} 
            activeRouter={activeRouter}
            setActiveRouter={setActiveRouter}
            userEmail={getAuth().currentUser?.email || undefined}
          />
        </View>
      </PagerView>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomBar, {
        backgroundColor: colors.background,
        borderTopColor: colors.glassBorder,
        paddingBottom: insets.bottom + 8,
      }]}>
        {tabs.map((tab, index) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabButton}
              onPress={() => handleTabPress(tab.key, index)}
              activeOpacity={0.65}
            >
              <View style={{ paddingVertical: 4, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons
                  name={tab.icon as any}
                  size={20}
                  color={active ? colors.primary : colors.textMuted}
                />
              </View>
              <Text style={[styles.tabText, {
                color: active ? colors.primary : colors.textMuted,
                fontWeight: active ? '600' : '400',
                fontSize: 10,
              }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function AppAuthGate({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const { colors } = useTheme();

  // Handle user state changes
  useEffect(() => {
    const authInstance = getAuth();
    const unsubscribe = onAuthStateChanged(authInstance, (usr) => {
      setUser(usr);
      if (!usr) {
        setApproved(null);
        setInitializing(false);
      }
    });
    return unsubscribe;
  }, []);

  // Listen to the Firestore user document in real-time
  useEffect(() => {
    if (!user) return;

    const userDocId = user.email ? user.email.toLowerCase() : null;
    if (!userDocId) {
      console.warn('No email found for user during Firestore check');
      setInitializing(false);
      return;
    }

    const db = getFirestore();
    const userDocRef = doc(db, 'users', userDocId);
    const unsubscribe = onSnapshot(
      userDocRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setApproved(!!data?.approved);
        } else {
          // If the document doesn't exist, register the user automatically
          try {
            await setDoc(userDocRef, {
              uid: user.uid,
              email: userDocId,
              name: user.displayName || 'Unnamed User',
              approved: false,
              createdAt: serverTimestamp(),
            });
            setApproved(false);
          } catch (err) {
            console.error('Failed to create user document:', err);
            setApproved(false);
          }
        }
        setInitializing(false);
      },
      (err) => {
        console.error('Firestore user doc snapshot error:', err);
        setInitializing(false);
      }
    );

    return unsubscribe;
  }, [user]);

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!approved) {
    return <PendingScreen email={user.email} />;
  }

  return <>{children}</>;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    'PlusJakartaSans-ExtraBold': PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090b', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppAuthGate>
          <AppInner />
        </AppAuthGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  routerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statChipText: {
    fontSize: 10,
    fontWeight: '500',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  helpBtn: {
    padding: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabIconPill: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  tabText: {
    fontSize: 9.5,
    letterSpacing: 0.2,
  },
});
