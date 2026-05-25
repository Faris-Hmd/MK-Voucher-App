import { StatusBar } from 'expo-status-bar';
import { View, TouchableOpacity, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import { checkConnectionAPI, fetchSystemResourcesAPI, fetchSystemHealthAPI, fetchActiveSessionsAPI, formatUptimeAPI } from './src/api';
import { loadConfig, saveConfig, saveSavedRouters, loadSavedRouters, RouterConfig } from './src/store';

import GenerateScreen from './src/screens/GenerateScreen';
import ListScreen from './src/screens/ListScreen';
import UsersScreen from './src/screens/UsersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HelpScreen from './src/screens/HelpScreen';
import StatsScreen from './src/screens/StatsScreen';
import LoginScreen from './src/screens/LoginScreen';
import PendingScreen from './src/screens/PendingScreen';

import PagerView from 'react-native-pager-view';
import { getAuth, onAuthStateChanged, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from '@react-native-firebase/firestore';

type Tab = 'generate' | 'list' | 'users' | 'stats' | 'settings';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'generate', label: 'Vouchers',  icon: 'add-circle' },
  { key: 'list',     label: 'Batch',     icon: 'list'       },
  { key: 'users',    label: 'Users',     icon: 'people'     },
  { key: 'stats',    label: 'Stats',     icon: 'stats-chart' },
  { key: 'settings', label: 'Settings',  icon: 'settings'   },
];

const TAB_TITLES: Record<Tab, string> = {
  generate: 'Vouchers & Profiles',
  list:     'Batch & Print',
  users:    'Hotspot Users',
  stats:    'Live Stats',
  settings: 'Settings',
};

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [showHelp, setShowHelp] = useState(false);
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

      {/* Top header bar */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.glassBorder }]}>
        <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {TAB_TITLES[activeTab]}
          </Text>
          {activeRouter && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Ionicons name="wifi" size={11} color={isConnected ? colors.primary : colors.textMuted} />
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>
                {activeRouter.name || activeRouter.ip}
              </Text>
              
            </View>
          )}
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {isConnected !== null && (
            <View style={[styles.statusBadge, { backgroundColor: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.statusDot, { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }]} />
                <Text style={[styles.statusText, { color: isConnected ? '#22c55e' : '#ef4444' }]}>
                  {isConnected ? 'Connected' : 'Offline'}
                </Text>
              </View>
            </View>
          )}
          <TouchableOpacity onPress={() => setShowHelp(true)} style={styles.helpBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={26} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Second bar for system resources */}
      {isConnected && resources && (
        <View style={[styles.subHeader, { backgroundColor: colors.cardBg, borderBottomColor: colors.glassBorder }]}>
          <View style={styles.resourceItem}>
            <Ionicons name="people" size={14} color="#22c55e" />
            <Text style={[styles.resourceText, { color: colors.foreground }]}>
              Online: <Text style={{ fontWeight: '400' }}>{onlineCount}</Text>
            </Text>
          </View>

          <View style={styles.resourceItem}>
            <Ionicons name="hardware-chip-outline" size={14} color={colors.primary} />
            <Text style={[styles.resourceText, { color: colors.foreground }]}>
              CPU: <Text style={{ fontWeight: '400' }}>{resources['cpu-load']}%</Text>
            </Text>
          </View>
          
          <View style={styles.resourceItem}>
            <Ionicons name="pie-chart-outline" size={14} color={colors.primary} />
            <Text style={[styles.resourceText, { color: colors.foreground }]}>
              RAM: <Text style={{ fontWeight: '400' }}>{Math.round((parseInt(resources['total-memory']) - parseInt(resources['free-memory'])) / (1024 * 1024))}/{Math.round(parseInt(resources['total-memory']) / (1024 * 1024))}MB</Text>
            </Text>
          </View>

          <View style={styles.resourceItem}>
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text style={[styles.resourceText, { color: colors.foreground }]}>
              Up: <Text style={{ fontWeight: '400' }}>{formatUptimeAPI(resources['uptime'])}</Text>
            </Text>
          </View>

          {getTemperature() && (
            <View style={styles.resourceItem}>
              <Ionicons name="thermometer-outline" size={14} color="#ef4444" />
              <Text style={[styles.resourceText, { color: colors.foreground }]}>
                <Text style={{ fontWeight: '400' }}>{getTemperature()}°C</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Third bar for model name */}
      {isConnected && resources?.['board-name'] && (
        <View style={[styles.modelBar, { backgroundColor: colors.cardBg, borderBottomColor: colors.glassBorder }]}>
          <Ionicons name="cube-outline" size={14} color={colors.primary} />
          <Text style={[styles.modelText, { color: colors.foreground }]}>
            Device: <Text style={{ fontWeight: '400' }}>{resources['board-name']}</Text>
          </Text>
        </View>
      )}

      {/* Swipeable Main content */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
      >
        <View key="1"><GenerateScreen /></View>
        <View key="2"><ListScreen /></View>
        <View key="3"><UsersScreen /></View>
        <View key="4">
          <StatsScreen 
            resources={resources} 
            health={health} 
            getTemperature={getTemperature} 
            isConnected={isConnected} 
          />
        </View>
        <View key="5">
          <SettingsScreen 
            onSave={checkStatus} 
            activeRouter={activeRouter}
            setActiveRouter={setActiveRouter}
          />
        </View>
      </PagerView>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomBar, {
        backgroundColor: colors.cardBg,
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
            >
              <Ionicons
                name={tab.icon as any}
                size={24}
                color={active ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Help Modal */}
      <Modal
        visible={showHelp}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { backgroundColor: colors.cardBg, borderBottomColor: colors.glassBorder, paddingTop: insets.top || 16 }]}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Setup Guide</Text>
            <TouchableOpacity onPress={() => setShowHelp(false)} style={styles.helpBtn}>
              <Ionicons name="close-circle-outline" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <HelpScreen />
        </View>
      </Modal>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  helpBtn: {
    padding: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    justifyContent: 'space-around',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabText: {
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resourceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  modelText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
