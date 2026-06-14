import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl
} from 'react-native';
import { useTheme } from '../ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { 
  fetchActiveSessionsAPI, 
  fetchHostsAPI, 
  removeActiveSessionAPI, 
  fetchVouchersAPI, 
  fetchLeasesAPI, 
  fetchSchedulersAPI, 
  formatUptimeAPI, 
  fetchSystemClockAPI 
} from '../api';

export default function UsersScreen() {
  const { colors, styles } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const formatBytes = (bytes: string | number) => {
    const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(b) || b === 0) return '0 MB';
    if (b >= 1024 * 1024 * 1024) {
      return (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
    return Math.floor(b / (1024 * 1024)) + ' MB';
  };

  const getDeviceIcon = (deviceName: string): "phone-portrait-outline" | "tablet-portrait-outline" | "laptop-outline" => {
    const name = (deviceName || '').toLowerCase();
    if (
      name.includes('phone') || 
      name.includes('iphone') || 
      name.includes('android') || 
      name.includes('galaxy') || 
      name.includes('redmi') || 
      name.includes('pixel') || 
      name.includes('huawei') || 
      name.includes('oppo') || 
      name.includes('vivo') ||
      name.includes('xiaomi')
    ) {
      return 'phone-portrait-outline';
    }
    if (
      name.includes('pad') || 
      name.includes('ipad') || 
      name.includes('tablet') ||
      name.includes('tab')
    ) {
      return 'tablet-portrait-outline';
    }
    return 'laptop-outline';
  };

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [activeRaw, hostsRaw, usersRaw, leasesRaw, schedsRaw] = await Promise.all([
        fetchActiveSessionsAPI().catch(() => []),
        fetchHostsAPI().catch(() => []),
        fetchVouchersAPI().catch(() => []),
        fetchLeasesAPI().catch(() => []),
        fetchSchedulersAPI().catch(() => [])
      ]);

      const active = Array.isArray(activeRaw) ? activeRaw : [];
      const hosts = Array.isArray(hostsRaw) ? hostsRaw : [];
      const users = Array.isArray(usersRaw) ? usersRaw : [];
      const leases = Array.isArray(leasesRaw) ? leasesRaw : [];

      const systemUsers = ['admin', 'default', 'default-trial'];

      // Map host entries to unified client objects
      const hostClients = hosts.map((h: any) => {
        const hostMac = (h['mac-address'] || '').toLowerCase();
        
        // Match active session by MAC or IP
        const session = active.find((s: any) => 
          (s['mac-address'] || '').toLowerCase() === hostMac || 
          s.address === h.address
        );

        const isOnline = !!session;
        const userName = session?.user || h.comment || '';
        const userObj = userName ? users.find((u: any) => u.name === userName) : null;
        const lease = leases.find((l: any) => (l['mac-address'] || '').toLowerCase() === hostMac);

        let deviceName = lease?.['host-name'] || h['host-name'] || '';
        if (!deviceName) {
          deviceName = isOnline ? (session?.user || 'Active Client') : 'Offline Client';
        }

        return {
          id: h['.id'] || hostMac || h.address,
          name: deviceName,
          ip: h.address || session?.address || 'N/A',
          mac: hostMac,
          isOnline,
          usage: session ? formatBytes(session['bytes-out']) : '—',
          session: session ? formatUptimeAPI(session.uptime) : '—',
          rawSession: session,
          profile: userObj?.profile || session?.profile || 'default'
        };
      });

      // Filter duplicate IPs
      const seen = new Set<string>();
      const unifiedClients = hostClients.filter(c => {
        if (!c.ip || c.ip === 'N/A') return true;
        if (seen.has(c.ip)) return false;
        seen.add(c.ip);
        return true;
      });

      // Sort: Online first, then alphabetically
      unifiedClients.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setData(unifiedClients);
      setOnlineCount(unifiedClients.filter(c => c.isOnline).length);
    } catch (error) {
      console.error("Error loading users data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 20000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleKick = (client: any) => {
    if (!client.rawSession || !client.rawSession['.id']) return;
    
    Alert.alert(
      "Kick User",
      `Are you sure you want to disconnect ${client.name || 'this user'}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Kick", 
          style: "destructive",
          onPress: async () => {
            try {
              await removeActiveSessionAPI(client.rawSession['.id']);
              loadData(true);
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          }
        }
      ]
    );
  };

  const filteredData = data.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.profile.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderClientItem = ({ item }: { item: any }) => {
    const iconName = getDeviceIcon(item.name);
    return (
      <TouchableOpacity
        onPress={() => item.isOnline && handleKick(item)}
        activeOpacity={item.isOnline ? 0.7 : 1}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 10,
          backgroundColor: colors.cardBg,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1.2,
          borderColor: colors.glassBorder,
          marginBottom: 8
        }}
      >
        {/* Device Icon + Status badge */}
        <View style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          backgroundColor: colors.secondary,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          <Ionicons name={iconName} size={16} color={colors.foreground} style={{ opacity: 0.8 }} />
          <View style={{
            position: 'absolute',
            top: -1.5,
            right: -1.5,
            width: 9,
            height: 9,
            borderRadius: 4.5,
            borderWidth: 1.5,
            borderColor: colors.cardBg,
            backgroundColor: item.isOnline ? '#22c55e' : colors.textMuted
          }} />
        </View>

        {/* Client Name & IP */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text 
            style={{ 
              fontSize: 13, 
              fontWeight: '600', 
              color: colors.foreground 
            }} 
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text 
            style={{ 
              fontFamily: 'monospace', 
              fontSize: 10, 
              color: colors.textMuted, 
              marginTop: 1 
            }} 
            numberOfLines={1}
          >
            {item.ip}
          </Text>
        </View>

        {/* Usage & Session time */}
        <View style={{ alignItems: 'flex-end', minWidth: 70 }}>
          <Text 
            style={{ 
              fontSize: 13, 
              fontWeight: '600', 
              color: colors.foreground 
            }}
          >
            {item.usage}
          </Text>
          <Text 
            style={{ 
              fontSize: 10, 
              color: colors.textMuted, 
              marginTop: 1 
            }}
          >
            {item.session}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header bar with Count & Refresh */}
      <View style={{ 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 16, 
        marginTop: 12, 
        marginBottom: 8 
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.textMuted }}>
          Connected Users
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.foreground }}>
            <Text style={{ color: '#22c55e' }}>{onlineCount} online</Text>
            <Text style={{ color: colors.textMuted }}> / {data.length} total</Text>
          </Text>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing || loading} style={{ padding: 4 }}>
            {refreshing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons name="refresh" size={16} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input */}
      {data.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.cardBg,
            borderRadius: 10,
            borderWidth: 1.2,
            borderColor: colors.glassBorder,
            paddingHorizontal: 10,
            height: 38
          }}>
            <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, IP, or profile..."
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                fontSize: 12,
                color: colors.foreground,
                padding: 0
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: 13 }}>Fetching users...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          renderItem={renderClientItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
              colors={[colors.primary]} 
            />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 40 }}>
              <Ionicons name="people-outline" size={44} color={colors.textMuted} />
              <Text style={{ marginTop: 12, color: colors.textMuted, textAlign: 'center', fontSize: 13 }}>
                {searchQuery ? 'No matching clients found' : 'No clients found'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
