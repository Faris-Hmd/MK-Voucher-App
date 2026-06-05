import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import { fetchVouchersAPI, deleteVouchersAPI, fetchActiveSessionsAPI, fetchSchedulersAPI, formatUptimeAPI } from '../api';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { loadConfig } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

const getNormalizedComment = (comment: string | null | undefined): string => {
  const raw = comment || 'Old / Unknown';
  return raw.split(' | EXP:')[0];
};

export default function ListScreen() {
  const { colors, styles } = useTheme();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [printingGroup, setPrintingGroup] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [schedulers, setSchedulers] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const getRemainingTime = (session: any, user: any, killSched?: any) => {
    let finalDateStr = '';
    if (killSched && killSched['start-date'] && killSched['start-time']) {
      finalDateStr = `${killSched['start-date']}T${killSched['start-time']}`;
    } 
    if (!finalDateStr) {
      const comment = user?.comment || session?.comment || '';
      const expMatch = comment.match(/EXP:(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})/);
      if (expMatch) {
        finalDateStr = `${expMatch[1]}T${expMatch[2]}`;
      }
    }
    if (finalDateStr) {
      try {
        const expDate = new Date(finalDateStr);
        const now = new Date();
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
    if (session && session['session-time-left'] && session['session-time-left'] !== 'Unlimited') {
      return session['session-time-left'];
    }
    return 'Unlimited';
  };

  const loadVouchers = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [data, activeRaw, schedsRaw] = await Promise.all([
        fetchVouchersAPI(),
        fetchActiveSessionsAPI().catch(() => []),
        fetchSchedulersAPI().catch(() => [])
      ]);
      setRawData(data);
      
      const active = Array.isArray(activeRaw) ? activeRaw : [];
      const scheds = Array.isArray(schedsRaw) ? schedsRaw : [];
      setActiveSessions(active);
      setSchedulers(scheds);
      
      const activeUserNames = new Set(active.map((s: any) => s.user));
      
      let usersArray = [];
      if (Array.isArray(data)) {
        usersArray = data;
      } else if (data && typeof data === 'object') {
        usersArray = [data]; // Handle single object case
      } else {
        throw new Error("Unexpected API response: " + JSON.stringify(data).substring(0, 100));
      }

      const filtered = usersArray.filter((u: any) => u.name !== 'admin' && u.name !== 'default' && u.name !== 'default-trial');
      
      // Attach "isCurrentlyOnline" property to each voucher
      const enriched = filtered.map(u => ({
        ...u,
        isCurrentlyOnline: activeUserNames.has(u.name)
      }));
      
      setVouchers(enriched);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to router. Check your IP and credentials in Settings, and ensure your device is connected to the MikroTik network.');
      console.log('Failed to fetch vouchers', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVouchers();
    const interval = setInterval(() => loadVouchers(), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDeleteGroup = async (prof: string, users: any[]) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete all ${users.length} vouchers in profile ${prof}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const ids = users.map(u => u['.id']);
              await deleteVouchersAPI(ids);
              Alert.alert("Success", "Group Deleted!");
              loadVouchers();
            } catch(e) {
              Alert.alert("Error", "Failed to delete group");
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  const handlePrintGroup = async (profName: string, batchTime: string, users: any[]) => {
    const availableToPrint = users.filter((u: any) => {
      const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
      return !hasKillSched;
    });

    if (availableToPrint.length === 0) {
      Alert.alert("Notice", "There are no unused vouchers left in this batch to print.");
      return;
    }

    const groupKey = `${profName}-${batchTime}`;
    setPrintingGroup(groupKey);
    try {
      const config = await loadConfig();
      const printWifiName = config?.wifiName || 'WI-FI ACCESS';

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Space+Grotesk:wght@700&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; color: #000000; font-family: 'Cairo', 'Plus Jakarta Sans', -apple-system, sans-serif; }
    @page { margin: 8mm; size: A4; }

    .page-header {
      text-align: center;
      padding-bottom: 10px;
      margin-bottom: 15px;
      border-bottom: 2px solid #000000;
    }
    .page-header h1 {
      font-size: 15pt;
      font-weight: 800;
      color: #000000;
      letter-spacing: 0.5px;
    }
    .page-header p {
      font-size: 8pt;
      color: #000000;
      margin-top: 3px;
      font-weight: 600;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
    }

    .voucher {
      background: #ffffff;
      border: 1.5px solid #000000;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      text-align: center;
      page-break-inside: avoid;
      padding: 8px 6px;
    }
    
    .wifi-name {
      font-size: 6.5pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
      color: #000000;
    }
    
    .profile-name {
      font-size: 7.5pt;
      font-weight: 700;
      color: #000000;
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }
    
    .divider {
      border: none;
      border-top: 1.5px solid #000000;
      margin: 4px 0 6px 0;
      width: 100%;
    }
    
    .code {
      font-family: 'Space Grotesk', monospace;
      font-size: 12pt;
      font-weight: 800;
      color: #000000;
      letter-spacing: 2.5px;
      padding: 2px 0;
    }
  </style>
</head>
<body dir="auto">
  <div class="page-header" dir="auto">
    <h1 dir="auto">${printWifiName}</h1>
    <p dir="auto">${profName} &mdash; ${batchTime} &mdash; ${availableToPrint.length} Vouchers</p>
  </div>
  <div class="grid">
    ${availableToPrint.map(u => `
    <div class="voucher">
      <div class="wifi-name" dir="auto">${printWifiName}</div>
      <div class="profile-name" dir="auto">${profName}</div>
      <hr class="divider"/>
      <div class="code">${u.name}</div>
    </div>`).join('')}
  </div>
</body>
</html>`;

      // 2. Generate PDF
      const { uri } = await Print.printToFileAsync({ 
        html,
        width: 595,
        height: 842
      });
      
      // 3. Move to a persistent "vouchers" folder on device
      if (!FileSystem.documentDirectory) {
        throw new Error("File system not available on this device. Cannot save PDF.");
      }
      const vouchersDir = FileSystem.documentDirectory + 'vouchers/';
      const dirInfo = await FileSystem.getInfoAsync(vouchersDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(vouchersDir, { intermediates: true });
      }

      const safeWifi = printWifiName.replace(/[\/\\?%*:|"<>\s]/g, '_');
      const safeProf = profName.replace(/[\/\\?%*:|"<>\s]/g, '_');
      const count = availableToPrint.length;
      const fileName = `${safeWifi}-${safeProf}-${count}.pdf`;
      const newUri = vouchersDir + fileName;
      
      await FileSystem.moveAsync({
        from: uri,
        to: newUri
      });

      // 4. Share/Open file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        Alert.alert("Saved", `PDF saved to ${newUri}`);
      }
    } catch (err: any) {
      Alert.alert('Print Error', err.message);
    } finally {
      setPrintingGroup(null);
    }
  };

  const grouped = vouchers.reduce((acc: Record<string, Record<string, any[]>>, user: any) => {
    const p = user.profile || 'unknown';
    const c = getNormalizedComment(user.comment);
    
    if (!acc[p]) acc[p] = {};
    if (!acc[p][c]) acc[p][c] = [];
    acc[p][c].push(user);
    return acc;
  }, {} as Record<string, Record<string, any[]>>);

  const stats = React.useMemo(() => {
    let totalGenerated = 0;
    let totalAvailable = 0;
    let totalActive = 0;
    
    Object.values(grouped).forEach(batches => {
      Object.entries(batches).forEach(([comment, users]) => {
        const originalCountMatch = comment.match(/\|\s*(\d{4})$/);
        const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : users.length;
        totalGenerated += originalCount;
        
        const availableInBatch = users.filter((u: any) => {
          const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
          return !hasKillSched;
        }).length;
        
        totalAvailable += availableInBatch;

        const activeInBatch = users.filter((u: any) => {
          return schedulers.some((s: any) => s.name === `kill_${u.name}`);
        }).length;
        totalActive += activeInBatch;
      });
    });
    
    return {
      totalGenerated,
      totalAvailable,
      totalActive
    };
  }, [grouped, schedulers]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {selectedBatch ? (() => {
        const freshUsers = vouchers.filter(
          (u: any) => u.profile === selectedBatch.profile && getNormalizedComment(u.comment) === selectedBatch.comment
        );
        const originalCountMatch = selectedBatch.comment.match(/\|\s*(\d{4})$/);
        const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : freshUsers.length;

        const availableVouchers = freshUsers.filter((u: any) => {
          const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
          return !hasKillSched;
        });

        const inUseVouchers = freshUsers.filter((u: any) => {
          const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
          return hasKillSched;
        });

        const remainingCount = availableVouchers.length;

        const filteredInUse = inUseVouchers.filter((u: any) => 
          u.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
          <View style={{ flex: 1, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
              <TouchableOpacity 
                onPress={() => {
                  setSelectedBatch(null);
                  setSearchQuery('');
                }} 
                style={{ padding: 6 }}
              >
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '600' }}>Batch Details</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '500' }}>{selectedBatch.profile}</Text>
              </View>
              <TouchableOpacity onPress={loadVouchers} disabled={isLoading} style={{ padding: 6 }}>
                {isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh" size={18} color={colors.primary} />}
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
            >
              {/* Card Info */}
              <View style={[styles.card, { padding: 12, marginBottom: 16 }]}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '500', marginBottom: 4 }}>
                  Batch Generated Time
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600', marginBottom: 12 }}>
                  {selectedBatch.comment.split(' | ')[0]}
                </Text>

                {/* Quick Actions inside Card */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    style={{ 
                      flex: 1, 
                      flexDirection: 'row',
                      backgroundColor: colors.primary, 
                      height: 38, 
                      borderRadius: 10, 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: 8,
                      opacity: printingGroup === `${selectedBatch.profile}-${selectedBatch.comment}` ? 0.6 : 1 
                    }}
                    onPress={() => {
                      handlePrintGroup(selectedBatch.profile, selectedBatch.comment, freshUsers);
                    }}
                    disabled={printingGroup === `${selectedBatch.profile}-${selectedBatch.comment}`}
                  >
                    {printingGroup === `${selectedBatch.profile}-${selectedBatch.comment}`
                      ? <ActivityIndicator color="#fff" size="small" />
                      : (
                        <>
                          <Ionicons name="print" size={15} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>
                            Print Unused ({availableVouchers.length})
                          </Text>
                        </>
                      )
                    }
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ 
                      backgroundColor: 'rgba(220,38,38,0.06)', 
                      width: 38, 
                      height: 38, 
                      borderRadius: 10, 
                      alignItems: 'center', 
                      justifyContent: 'center',
                    }}
                    onPress={() => {
                      handleDeleteGroup(`${selectedBatch.profile} (${selectedBatch.comment})`, freshUsers);
                    }}
                    disabled={isDeleting}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stats Badges */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <View style={{ flex: 1, backgroundColor: colors.secondary, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '500' }}>Total</Text>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600', marginTop: 2 }}>{originalCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.secondary, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '500' }}>Unused</Text>
                  <Text style={{ color: '#22c55e', fontSize: 15, fontWeight: '600', marginTop: 2 }}>{remainingCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.secondary, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '500' }}>Active</Text>
                  <Text style={{ color: '#f59e0b', fontSize: 15, fontWeight: '600', marginTop: 2 }}>{inUseVouchers.length}</Text>
                </View>
              </View>

              {/* Search bar inside batch detail */}
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                backgroundColor: colors.secondary, 
                borderRadius: 10, 
                paddingHorizontal: 12, 
                height: 38,
                marginBottom: 16
              }}>
                <Ionicons name="search" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, color: colors.foreground, fontSize: 13, height: '100%', padding: 0 }}
                  placeholder="Search voucher code..."
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Active / In-Use List */}
              <View style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '500' }}>
                    Active / In-Use Vouchers ({filteredInUse.length})
                  </Text>
                </View>

                {filteredInUse.length === 0 ? (
                  <View style={{ padding: 12, backgroundColor: colors.secondary, borderRadius: 8, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                      {searchQuery ? 'No matching active vouchers.' : 'No active vouchers in this batch.'}
                    </Text>
                  </View>
                ) : (
                  filteredInUse.map((u: any) => {
                    const session = activeSessions.find((s: any) => s.user === u.name);
                    const killSched = schedulers.find((s: any) => s.name === `kill_${u.name}`);
                    const remaining = getRemainingTime(session, u, killSched);
                    const isOnline = !!session;

                    return (
                      <View key={u.name} style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        backgroundColor: colors.secondary,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        marginBottom: 6
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' }} />
                          <Text style={{ color: colors.foreground, fontFamily: 'monospace', fontSize: 12, fontWeight: '500' }}>{u.name}</Text>
                          <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ color: '#f59e0b', fontSize: 8, fontWeight: '500' }}>Active</Text>
                          </View>
                          {isOnline && (
                            <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ color: colors.primary, fontSize: 8, fontWeight: '500' }}>Online</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                            Remaining: <Text style={{ color: colors.primary, fontWeight: '600' }}>{remaining}</Text>
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
              <View style={{ height: 50 }} />
            </ScrollView>
          </View>
        );
      })() : (
        <ScrollView 
          style={{ flex: 1, padding: 20 }} 
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '600' }}>Batch Overview</Text>
            <TouchableOpacity onPress={loadVouchers} disabled={isLoading} style={{ padding: 6 }}>
              {isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh" size={18} color={colors.primary} />}
            </TouchableOpacity>
          </View>

          {vouchers.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: colors.secondary, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '500' }}>Total</Text>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600', marginTop: 2 }}>{stats.totalGenerated}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.secondary, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '500' }}>Unused</Text>
                <Text style={{ color: '#22c55e', fontSize: 15, fontWeight: '600', marginTop: 2 }}>{stats.totalAvailable}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.secondary, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '500' }}>Active</Text>
                <Text style={{ color: '#f59e0b', fontSize: 15, fontWeight: '600', marginTop: 2 }}>{stats.totalActive}</Text>
              </View>
            </View>
          )}

          {errorMsg ? (
            <View style={{ 
              backgroundColor: 'rgba(220,38,38,0.06)', 
              padding: 20, 
              borderRadius: 12, 
              marginBottom: 20, 
              alignItems: 'center' 
            }}>
              <Ionicons name="alert-circle-outline" size={32} color="#ef4444" style={{ marginBottom: 10 }} />
              <Text style={{ color: '#ef4444', textAlign: 'center', marginBottom: 15, fontSize: 13, lineHeight: 18 }}>{errorMsg}</Text>
              <TouchableOpacity 
                onPress={loadVouchers} 
                disabled={isLoading}
                style={{ 
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.primary, 
                  paddingVertical: 10, 
                  paddingHorizontal: 20, 
                  borderRadius: 10,
                  gap: 8
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>Retry Connection</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {vouchers.length === 0 && !isLoading && !errorMsg ? (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 15, fontWeight: '500' }}>No vouchers found.</Text>
              <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 12, marginTop: 4 }}>Generate some from the Generate tab.</Text>
            </View>
          ) : null}

          {Object.entries(grouped).map(([prof, batches]) => {
            let profTotal = 0;
            let profUnused = 0;
            let profActive = 0;

            Object.entries(batches).forEach(([comment, users]) => {
              const originalCountMatch = comment.match(/\|\s*(\d{4})$/);
              const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : users.length;
              
              const availableCount = users.filter((u: any) => {
                const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
                return !hasKillSched;
              }).length;
              
              const activeCount = users.filter((u: any) => 
                schedulers.some((s: any) => s.name === `kill_${u.name}`)
              ).length;
              
              profTotal += originalCount;
              profUnused += availableCount;
              profActive += activeCount;
            });

            return (
              <View key={prof} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>{prof}</Text>
                  <View style={{ height: StyleSheet.hairlineWidth, flex: 1, backgroundColor: colors.glassBorder, opacity: 0.5 }} />
                </View>

                {/* Profile Overview Badges */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '500' }}>Total: </Text>
                    <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: '600' }}>{profTotal}</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(34,197,94,0.06)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '500' }}>Unused: </Text>
                    <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '600' }}>{profUnused}</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(245,158,11,0.06)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '500' }}>Active: </Text>
                    <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '600' }}>{profActive}</Text>
                  </View>
                </View>

              {Object.entries(batches).sort((a, b) => b[0].localeCompare(a[0])).map(([comment, users]) => {
                const groupKey = `${prof}-${comment}`;
                const isUnknown = comment === 'Old / Unknown';
                
                const originalCountMatch = comment.match(/\|\s*(\d{4})$/);
                const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : users.length;
                
                const availableVouchers = users.filter((u: any) => {
                  const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
                  return !hasKillSched;
                });
                
                const remainingCount = availableVouchers.length;
                const displayTime = comment.split(' | ')[0];
                const activeCount = users.filter((u: any) => 
                  schedulers.some((s: any) => s.name === `kill_${u.name}`)
                ).length;
                
                return (
                  <View key={comment} style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: colors.cardBg, 
                    paddingVertical: 10, 
                    paddingHorizontal: 12, 
                    borderRadius: 12, 
                    marginBottom: 6,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.glassBorder
                  }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '500' }}>{displayTime}</Text>
                        {activeCount > 0 && (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' }} />
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        {!isUnknown && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Total: </Text>
                            <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '500' }}>{originalCount}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: '#22c55e', fontSize: 10 }}>Unused: </Text>
                          <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '500' }}>{remainingCount}</Text>
                        </View>
                        {activeCount > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ color: '#f59e0b', fontSize: 10 }}>Active: </Text>
                            <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '500' }}>{activeCount}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.secondary, width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => setSelectedBatch({ profile: prof, comment, users })}
                      >
                        <Ionicons name="information-circle-outline" size={18} color={colors.foreground} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: colors.primary, width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: printingGroup === groupKey ? 0.6 : 1 }}
                        onPress={() => handlePrintGroup(prof, comment, users)}
                        disabled={printingGroup === groupKey}
                      >
                        {printingGroup === groupKey
                          ? <ActivityIndicator color="#fff" size="small" style={{ transform: [{ scale: 0.7 }] }} />
                          : <Ionicons name={"print" as any} size={15} color="#fff" />
                        }
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: 'rgba(220,38,38,0.06)', width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => handleDeleteGroup(`${prof} (${comment})`, users)}
                        disabled={isDeleting || printingGroup === groupKey}
                      >
                        <Ionicons name="trash-outline" size={15} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </View>
  );
}
