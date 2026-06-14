import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { useTheme } from '../ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { fetchActiveSessionsAPI, fetchHostsAPI, removeActiveSessionAPI, fetchVouchersAPI, fetchLeasesAPI, fetchSchedulersAPI, formatUptimeAPI, fetchSystemClockAPI } from '../api';

type MonitoringTab = 'active' | 'hosts';

export default function UsersScreen() {
  const { colors, styles } = useTheme();
  const [activeTab, setActiveTab] = useState<MonitoringTab>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [routerTimeOffset, setRouterTimeOffset] = useState<number>(0);

  const parseRouterTimeOffset = (clock: any): number => {
    if (!clock || !clock.date || !clock.time) return 0;
    try {
      let year = new Date().getFullYear();
      let month = new Date().getMonth();
      let day = new Date().getDate();
      
      const parts = clock.date.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          day = parseInt(parts[2], 10);
        } else {
          const months: Record<string, number> = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
          };
          let monthIdx = -1, yearIdx = -1, dayIdx = -1;
          parts.forEach((p: string, idx: number) => {
            const clean = p.toLowerCase().substring(0, 3);
            if (months[clean] !== undefined) monthIdx = idx;
            else if (p.length === 4) yearIdx = idx;
            else dayIdx = idx;
          });
          if (monthIdx !== -1) month = months[parts[monthIdx].toLowerCase().substring(0, 3)];
          if (yearIdx !== -1) year = parseInt(parts[yearIdx], 10);
          if (dayIdx !== -1) day = parseInt(parts[dayIdx], 10);
        }
      }
      
      let hours = 0, minutes = 0, seconds = 0;
      const timeParts = clock.time.split(':');
      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0], 10);
        minutes = parseInt(timeParts[1], 10);
        if (timeParts.length >= 3) seconds = Math.floor(parseFloat(timeParts[2]));
      }
      
      const routerDate = new Date(year, month, day, hours, minutes, seconds);
      const phoneDate = new Date();
      return routerDate.getTime() - phoneDate.getTime();
    } catch (e) {
      console.error("Error parsing router clock", e);
      return 0;
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [activeRaw, hostsRaw, usersRaw, leasesRaw, schedsRaw, clockRaw] = await Promise.all([
        fetchActiveSessionsAPI().catch(() => []),
        fetchHostsAPI().catch(() => []),
        fetchVouchersAPI().catch(() => []),
        fetchLeasesAPI().catch(() => []),
        fetchSchedulersAPI().catch(() => []),
        fetchSystemClockAPI().catch(() => null)
      ]);

      if (clockRaw) {
        setRouterTimeOffset(parseRouterTimeOffset(clockRaw));
      }

      const active = Array.isArray(activeRaw) ? activeRaw : [];
      const hosts = Array.isArray(hostsRaw) ? hostsRaw : [];
      const users = Array.isArray(usersRaw) ? usersRaw : [];
      const leases = Array.isArray(leasesRaw) ? leasesRaw : [];
      const scheds = Array.isArray(schedsRaw) ? schedsRaw : [];

      setOnlineCount(active.length);

      if (activeTab === 'active') {
        // Filter out system users
        const systemUsers = ['admin', 'default', 'default-trial'];
        
        const killScheds = scheds.filter((s: any) => s.name.startsWith('kill_'));
        const userNamesFromScheds = killScheds.map((s: any) => s.name.replace('kill_', ''));
        const activeUserNames = active.map((a: any) => a.user);
        
        const allConnectedUserNames = Array.from(new Set([...userNamesFromScheds, ...activeUserNames]))
          .filter(name => !systemUsers.includes(name));
        
        const enhancedActive = allConnectedUserNames.map(userName => {
          const session = active.find((a: any) => a.user === userName);
          const user = users.find((u: any) => u.name === userName);
          const killSched = killScheds.find((s: any) => s.name === `kill_${userName}`);
          
          const isOnline = !!session;
          
          // Try to find MAC from session, then hosts, then leases
          let mac = session?.['mac-address'] || '';
          if (!mac) {
             const host = hosts.find((h: any) => h.user === userName);
             mac = host?.['mac-address'] || '';
          }
          const macLower = (mac || '').toLowerCase();
          
          const host = hosts.find((h: any) => (h['mac-address'] || '').toLowerCase() === macLower);
          const lease = leases.find((l: any) => (l['mac-address'] || '').toLowerCase() === macLower);
          
          return {
            '.id': session?.['.id'] || killSched?.['.id'] || userName,
            user: userName,
            isOnline,
            status: isOnline ? 'Online' : 'Offline',
            profile: user?.profile || session?.profile || 'default',
            'session-time-left': getRemainingTime(session || {}, user, killSched),
            uptime: formatUptimeAPI(session?.uptime || 'Offline'),
            'bytes-out': session?.['bytes-out'] || '0',
            address: session?.address || host?.address || 'N/A',
            deviceName: lease?.['host-name'] || (isOnline ? 'Unknown Device' : 'Previously Connected'),
            interface: host?.interface || 'unknown'
          };
        });
        
        // Sort: Online first, then by remaining time or name
        enhancedActive.sort((a, b) => {
          if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
          return a.user.localeCompare(b.user);
        });

        setData(enhancedActive);
      } else {
        const enhancedHosts = hosts.map((h: any) => {
          const hostMac = (h['mac-address'] || '').toLowerCase();
          const session = active.find((s: any) => (s['mac-address'] || '').toLowerCase() === hostMac);
          const user = session ? users.find((u: any) => u.name === session.user) : null;
          const lease = leases.find((l: any) => (l['mac-address'] || '').toLowerCase() === hostMac);
          const killSched = session ? scheds.find((s: any) => s.name === `kill_${session.user}`) : null;
          
          return { 
            ...h, 
            profile: user?.profile || (session ? 'default' : null),
            'session-time-left': session ? getRemainingTime(session, user, killSched) : null,
            user: session?.user,
            deviceName: lease?.['host-name'] || 'Unknown Device',
            interface: h.interface || 'unknown'
          };
        });
        setData(enhancedHosts);
      }
    } catch (error: any) {
      console.error("Critical error in loadData:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleKick = (session: any) => {
    Alert.alert(
      "Kick User",
      `Are you sure you want to disconnect ${session.user || 'this user'}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Kick", 
          style: "destructive",
          onPress: async () => {
            try {
              await removeActiveSessionAPI(session['.id']);
              loadData(true);
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          }
        }
      ]
    );
  };

  const getRemainingTime = (session: any, user: any, killSched?: any) => {
    let finalDateStr = '';
    if (killSched && killSched['start-date'] && killSched['start-time']) {
      finalDateStr = `${killSched['start-date']}T${killSched['start-time']}`;
    } 
    if (!finalDateStr) {
      const comment = user?.comment || session.comment || '';
      const expMatch = comment.match(/EXP:(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})/);
      if (expMatch) {
        finalDateStr = `${expMatch[1]}T${expMatch[2]}`;
      }
    }
    if (finalDateStr) {
      try {
        const expDate = new Date(finalDateStr);
        const now = new Date(Date.now() + routerTimeOffset);
        const diffMs = expDate.getTime() - now.getTime();
        if (diffMs <= 0) return 'Expired';
        const diffSecs = Math.floor(diffMs / 1000);
        const days = Math.floor(diffSecs / 86400);
        const hours = Math.floor((diffSecs % 86400) / 3600);
        const mins = Math.floor((diffSecs % 3600) / 60);
        let res = '';
        if (days > 0) res += `${days}d `;
        if (hours > 0 || days > 0) res += `${hours}h `;
        res += `${mins}m`;
        return res;
      } catch (e) {}
    }
    if (session['session-time-left'] && session['session-time-left'] !== 'Unlimited') {
      return session['session-time-left'];
    }
    return 'Unlimited';
  };

  const formatMB = (bytes: string | number) => {
    const b = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(b) || b === 0) return '0 MB';
    return Math.floor(b / (1024 * 1024)) + ' MB';
  };

  const renderActiveItem = ({ item }: { item: any }) => {
    return (
      <View style={[styles.card, { padding: 14, borderWidth: 1.5, borderColor: colors.glassBorder }]}>
        <View style={localStyles.cardHeader}>
          <View style={localStyles.userInfo}>
            <View style={[localStyles.iconContainer, { backgroundColor: colors.secondary }]}>
              <Ionicons name="person" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[localStyles.userName, { color: colors.foreground, fontFamily: 'monospace', fontWeight: '700' }]}>{item.user}</Text>
                <View style={{ 
                  backgroundColor: item.isOnline ? 'rgba(34,197,94,0.06)' : 'rgba(107,114,128,0.06)', 
                  paddingHorizontal: 6, 
                  paddingVertical: 1, 
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: item.isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)'
                }}>
                  <Text style={{ color: item.isOnline ? '#22c55e' : colors.textMuted, fontSize: 9, fontWeight: '600' }}>{item.status}</Text>
                </View>
              </View>
              <Text style={[localStyles.userMeta, { color: colors.primary, fontWeight: '600', marginTop: 2 }]}>{item.deviceName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[localStyles.userMeta, { color: colors.textMuted, marginTop: 0 }]}>
                  {item.interface && item.interface !== 'unknown' ? `${item.interface} • ` : ''}{item.address}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {item.isOnline && (
              <TouchableOpacity 
                onPress={() => handleKick(item)}
                style={[localStyles.kickButton, { backgroundColor: 'rgba(239,68,68,0.06)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.12)' }]}
              >
                <Ionicons name="log-out-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[localStyles.divider, { backgroundColor: colors.glassBorder, marginVertical: 12 }]} />

        <View style={localStyles.statsGrid}>
          <View style={[localStyles.statCapsule, { backgroundColor: colors.secondary }]}>
            <Text style={[localStyles.statLabel, { color: colors.textMuted }]}>Profile</Text>
            <Text style={[localStyles.statValue, { color: colors.foreground }]} numberOfLines={1}>{item.profile}</Text>
          </View>
          <View style={[localStyles.statCapsule, { backgroundColor: colors.secondary }]}>
            <Text style={[localStyles.statLabel, { color: colors.textMuted }]}>Uptime</Text>
            <Text style={[localStyles.statValue, { color: colors.foreground }]} numberOfLines={1}>{item.uptime}</Text>
          </View>
          <View style={[localStyles.statCapsule, { backgroundColor: colors.secondary }]}>
            <Text style={[localStyles.statLabel, { color: colors.textMuted }]}>Remain</Text>
            <Text style={[localStyles.statValue, { color: colors.primary }]} numberOfLines={1}>{item['session-time-left']}</Text>
          </View>
          <View style={[localStyles.statCapsule, { backgroundColor: colors.secondary }]}>
            <Text style={[localStyles.statLabel, { color: colors.textMuted }]}>Down</Text>
            <Text style={[localStyles.statValue, { color: colors.foreground }]} numberOfLines={1}>{formatMB(item['bytes-out'])}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderHostItem = ({ item }: { item: any }) => {
    const isExpanded = expandedItems.has(item['.id']);
    return (
      <View style={styles.card}>
        <View style={localStyles.cardHeader}>
          <View style={localStyles.userInfo}>
            <View style={[localStyles.iconContainer, { backgroundColor: (item.authorized === 'true' ? '#22c55e' : colors.textMuted) + '12' }]}>
              <Ionicons 
                name={item.authorized === 'true' ? "shield-checkmark" : "help-circle"} 
                size={16} 
                color={item.authorized === 'true' ? '#22c55e' : colors.textMuted} 
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[localStyles.userName, { color: colors.foreground }]}>{item.deviceName !== 'Unknown Device' ? item.deviceName : item.address}</Text>
              <Text style={[localStyles.userMeta, { color: colors.textMuted, marginTop: 2 }]}>
                {item.authorized === 'true' ? `Authorized (${item.address})` : 'Unauthenticated'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            onPress={() => toggleExpand(item['.id'])}
            style={[localStyles.infoButton, { backgroundColor: colors.secondary }]}
          >
            <Ionicons name={isExpanded ? "chevron-up" : "information-circle-outline"} size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={[localStyles.divider, { backgroundColor: colors.glassBorder }]} />

        <View style={localStyles.hostDetails}>
          {item.interface && item.interface !== 'unknown' && (
            <View style={localStyles.hostDetailRow}>
              <Text style={[localStyles.hostLabel, { color: colors.textMuted }]}>Port</Text>
              <Text style={[localStyles.hostValue, { color: colors.primary, fontWeight: '500' }]}>{item.interface}</Text>
            </View>
          )}
          {item.profile && (
            <View style={localStyles.hostDetailRow}>
              <Text style={[localStyles.hostLabel, { color: colors.textMuted }]}>Profile</Text>
              <Text style={[localStyles.hostValue, { color: colors.foreground }]}>{item.profile}</Text>
            </View>
          )}
          {item['session-time-left'] && (
            <View style={localStyles.hostDetailRow}>
              <Text style={[localStyles.hostLabel, { color: colors.textMuted }]}>Remaining</Text>
              <Text style={[localStyles.hostValue, { color: colors.primary }]}>{item['session-time-left']}</Text>
            </View>
          )}
          {isExpanded && (
            <>
              <View style={localStyles.hostDetailRow}>
                <Text style={[localStyles.hostLabel, { color: colors.textMuted }]}>Server</Text>
                <Text style={[localStyles.hostValue, { color: colors.foreground }]}>{item.server || 'Any'}</Text>
              </View>
              {item.comment && (
                <View style={localStyles.hostDetailRow}>
                  <Text style={[localStyles.hostLabel, { color: colors.textMuted }]}>Comment</Text>
                  <Text style={[localStyles.hostValue, { color: colors.textMuted }]}>{item.comment}</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={localStyles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 12, marginTop: 15, marginBottom: 5 }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '600' }}>Hotspot Monitoring</Text>
        <TouchableOpacity onPress={onRefresh} disabled={refreshing || loading} style={{ padding: 6 }}>
          {(refreshing || (loading && data.length === 0)) ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh" size={18} color={colors.primary} />}
        </TouchableOpacity>
      </View>
      <View style={[localStyles.tabBar, { backgroundColor: colors.secondary, borderWidth: 1.5, borderColor: colors.glassBorder }]}>
        <TouchableOpacity 
          onPress={() => setActiveTab('active')}
          style={[localStyles.tab, activeTab === 'active' && { backgroundColor: colors.cardBg }]}
        >
          <Ionicons name="flash" size={14} color={activeTab === 'active' ? colors.primary : colors.textMuted} />
          <Text style={[localStyles.tabText, { color: activeTab === 'active' ? colors.foreground : colors.textMuted }]}>Active Sessions</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setActiveTab('hosts')}
          style={[localStyles.tab, activeTab === 'hosts' && { backgroundColor: colors.cardBg }]}
        >
          <Ionicons name="wifi" size={14} color={activeTab === 'hosts' ? colors.primary : colors.textMuted} />
          <Text style={[localStyles.tabText, { color: activeTab === 'hosts' ? colors.foreground : colors.textMuted }]}>All Hosts</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={localStyles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: 13 }}>Fetching users...</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={activeTab === 'active' ? renderActiveItem : renderHostItem}
          keyExtractor={(item) => item['.id']}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          ListHeaderComponent={
            data.length > 0 ? (
              <View style={[styles.card, { marginBottom: 12, padding: 12, backgroundColor: colors.secondary }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[localStyles.iconContainer, { backgroundColor: colors.primary + '12', width: 36, height: 36, borderRadius: 18 }]}>
                      <Ionicons name="people" size={18} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[localStyles.userName, { color: colors.foreground, fontSize: 15, fontWeight: '600' }]}>Monitoring Overview</Text>
                      <Text style={[localStyles.userMeta, { color: colors.textMuted, fontSize: 11, fontWeight: '500' }]}>{activeTab === 'active' ? 'Currently connected users' : 'All identified hotspot hosts'}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '600' }}>{onlineCount}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '500' }}>ONLINE</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={localStyles.center}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={{ marginTop: 12, color: colors.textMuted, textAlign: 'center', fontSize: 13 }}>No {activeTab === 'active' ? 'active sessions' : 'hosts'} found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: 'row', margin: 12, marginBottom: 0, borderRadius: 12, padding: 3, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 9, gap: 6 },
  tabText: { fontSize: 13, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconContainer: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 14, fontWeight: '600' },
  userMeta: { fontSize: 11 },
  kickButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  infoButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  statCapsule: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, opacity: 0.8 },
  macText: { fontSize: 10, fontFamily: 'monospace' },
  hostDetails: { gap: 6 },
  hostDetailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hostLabel: { fontSize: 12 },
  hostValue: { fontSize: 12, fontWeight: '500' }
});
