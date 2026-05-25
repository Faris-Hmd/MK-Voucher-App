import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useTheme } from '../ThemeContext';
import { fetchVouchersAPI, deleteVouchersAPI, fetchActiveSessionsAPI, fetchSchedulersAPI, formatUptimeAPI } from '../api';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { loadConfig } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

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
    const interval = setInterval(() => loadVouchers(), 60000);
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
    // Only print vouchers that haven't been used yet
    const availableToPrint = users.filter((u: any) => {
      const uptime = u.uptime || '0s';
      const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
      const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
      const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline || hasKillSched;
      return !hasBeenUsed;
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
    const rawComment = user.comment || 'Old / Unknown';
    // Normalize comment by stripping the expiration suffix added on login
    const c = rawComment.split(' | EXP:')[0];
    
    if (!acc[p]) acc[p] = {};
    if (!acc[p][c]) acc[p][c] = [];
    acc[p][c].push(user);
    return acc;
  }, {} as Record<string, Record<string, any[]>>);

  const stats = React.useMemo(() => {
    let totalGenerated = 0;
    let totalAvailable = 0;
    
    Object.values(grouped).forEach(batches => {
      Object.entries(batches).forEach(([comment, users]) => {
        const originalCountMatch = comment.match(/\|\s*(\d{4})$/);
        const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : users.length;
        totalGenerated += originalCount;
        
        const availableInBatch = users.filter((u: any) => {
          const uptime = u.uptime || '0s';
          const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
          const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline;
          return !hasBeenUsed;
        }).length;
        
        totalAvailable += availableInBatch;
      });
    });
    
    return {
      totalGenerated,
      totalAvailable,
      totalUsed: totalGenerated - totalAvailable
    };
  }, [grouped]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {selectedBatch ? (
        <View style={{ flex: 1, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
            <TouchableOpacity 
              onPress={() => {
                setSelectedBatch(null);
                setSearchQuery('');
              }} 
              style={{ backgroundColor: colors.glassBorder, padding: 8, borderRadius: 10 }}
            >
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800' }}>Batch Details</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{selectedBatch.profile}</Text>
            </View>
            <TouchableOpacity onPress={loadVouchers} disabled={isLoading} style={{ backgroundColor: colors.glassBorder, padding: 8, borderRadius: 10 }}>
              {isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh" size={20} color={colors.primary} />}
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Card Info */}
            <View style={[styles.card, { padding: 15, marginBottom: 15 }]}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Batch Generated Time
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
                {selectedBatch.comment.split(' | ')[0]}
              </Text>

              {/* Quick Actions inside Card */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={{ 
                    flex: 1, 
                    flexDirection: 'row',
                    backgroundColor: colors.primary, 
                    height: 40, 
                    borderRadius: 8, 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: 8,
                    opacity: printingGroup === `${selectedBatch.profile}-${selectedBatch.comment}` ? 0.6 : 1 
                  }}
                  onPress={() => {
                    const freshUsers = vouchers.filter(
                      (u: any) => u.profile === selectedBatch.profile && u.comment === selectedBatch.comment
                    );
                    handlePrintGroup(selectedBatch.profile, selectedBatch.comment, freshUsers);
                  }}
                  disabled={printingGroup === `${selectedBatch.profile}-${selectedBatch.comment}`}
                >
                  {printingGroup === `${selectedBatch.profile}-${selectedBatch.comment}`
                    ? <ActivityIndicator color="#fff" size="small" />
                    : (
                      <>
                        <Ionicons name="print" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                          Print Unused ({
                            vouchers.filter((u: any) => {
                              if (u.profile !== selectedBatch.profile || u.comment !== selectedBatch.comment) return false;
                              const uptime = u.uptime || '0s';
                              const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
                              const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
                              const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline || hasKillSched;
                              return !hasBeenUsed;
                            }).length
                          })
                        </Text>
                      </>
                    )
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ 
                    backgroundColor: 'rgba(220,38,38,0.1)', 
                    width: 40, 
                    height: 40, 
                    borderRadius: 8, 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderWidth: 1, 
                    borderColor: 'rgba(239,68,68,0.1)' 
                  }}
                  onPress={() => {
                    const freshUsers = vouchers.filter(
                      (u: any) => u.profile === selectedBatch.profile && u.comment === selectedBatch.comment
                    );
                    handleDeleteGroup(`${selectedBatch.profile} (${selectedBatch.comment})`, freshUsers);
                  }}
                  disabled={isDeleting}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats Badges */}
            {(() => {
              const freshUsers = vouchers.filter(
                (u: any) => u.profile === selectedBatch.profile && u.comment === selectedBatch.comment
              );
              const originalCountMatch = selectedBatch.comment.match(/\|\s*(\d{4})$/);
              const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : freshUsers.length;

              const availableVouchers = freshUsers.filter((u: any) => {
                const uptime = u.uptime || '0s';
                const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
                const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
                const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline || hasKillSched;
                return !hasBeenUsed;
              });

              const inUseVouchers = freshUsers.filter((u: any) => {
                const uptime = u.uptime || '0s';
                const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
                const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
                const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline || hasKillSched;
                return hasBeenUsed;
              });

              const usedCount = originalCount - availableVouchers.length;
              const remainingCount = availableVouchers.length;

              const filteredInUse = inUseVouchers.filter((u: any) => 
                u.name.toLowerCase().includes(searchQuery.toLowerCase())
              );
              const filteredUnused = availableVouchers.filter((u: any) => 
                u.name.toLowerCase().includes(searchQuery.toLowerCase())
              );

              const handleCopyCode = async (code: string) => {
                await Clipboard.setStringAsync(code);
                Alert.alert("Copied", `Voucher code ${code} copied to clipboard.`);
              };

              return (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 15 }}>
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.glassBorder, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                      <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Total</Text>
                      <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '800', marginTop: 2 }}>{originalCount}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.glassBorder, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#22c55e', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Unused</Text>
                      <Text style={{ color: '#22c55e', fontSize: 16, fontWeight: '800', marginTop: 2 }}>{remainingCount}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.glassBorder, padding: 10, borderRadius: 10, alignItems: 'center' }}>
                      <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Used</Text>
                      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '800', marginTop: 2 }}>{usedCount}</Text>
                    </View>
                  </View>

                  {/* Search bar inside batch detail */}
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: colors.cardBg, 
                    borderRadius: 10, 
                    paddingHorizontal: 12, 
                    height: 40,
                    borderWidth: 1,
                    borderColor: colors.glassBorder,
                    marginBottom: 15
                  }}>
                    <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
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
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Active / In-Use List */}
                  <View style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Active / In-Use Vouchers ({filteredInUse.length})
                      </Text>
                    </View>

                    {filteredInUse.length === 0 ? (
                      <View style={{ padding: 12, backgroundColor: colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: colors.glassBorder }}>
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
                        const uptimeStr = session ? formatUptimeAPI(session.uptime) : formatUptimeAPI(u.uptime || '0s');

                        return (
                          <View key={u.name} style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            backgroundColor: colors.cardBg,
                            borderWidth: 1,
                            borderColor: colors.glassBorder,
                            padding: 10,
                            borderRadius: 8,
                            marginBottom: 6
                          }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOnline ? '#22c55e' : '#eab308' }} />
                              <Text style={{ color: colors.foreground, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' }}>{u.name}</Text>
                              {isOnline && (
                                <View style={{ backgroundColor: '#22c55e20', paddingHorizontal: 4, borderRadius: 3 }}>
                                  <Text style={{ color: '#22c55e', fontSize: 8, fontWeight: '800' }}>ONLINE</Text>
                                </View>
                              )}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '600' }}>
                                Used: {uptimeStr}
                              </Text>
                              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                                Remaining: <Text style={{ color: colors.primary, fontWeight: '700' }}>{remaining}</Text>
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>

                  {/* Unused / Available List */}
                  <View style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Unused / Available Vouchers ({filteredUnused.length})
                      </Text>
                    </View>

                    {filteredUnused.length === 0 ? (
                      <View style={{ padding: 12, backgroundColor: colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: colors.glassBorder }}>
                        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                          {searchQuery ? 'No matching unused vouchers.' : 'No unused vouchers left.'}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ 
                        flexDirection: 'row', 
                        flexWrap: 'wrap', 
                        gap: 8, 
                        backgroundColor: colors.cardBg, 
                        padding: 12, 
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.glassBorder
                      }}>
                        {filteredUnused.map((u: any) => (
                          <TouchableOpacity 
                            key={u.name} 
                            onPress={() => handleCopyCode(u.name)}
                            style={{ 
                              backgroundColor: colors.background, 
                              borderWidth: 1,
                              borderColor: colors.glassBorder,
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 6,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Text style={{ color: colors.foreground, fontFamily: 'monospace', fontSize: 11, fontWeight: '700' }}>{u.name}</Text>
                            <Ionicons name="copy-outline" size={10} color={colors.textMuted} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              );
            })()}
            <View style={{ height: 50 }} />
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flex: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800' }}>Batch Overview</Text>
            <TouchableOpacity onPress={loadVouchers} disabled={isLoading} style={{ backgroundColor: colors.glassBorder, padding: 8, borderRadius: 10 }}>
              {isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh" size={20} color={colors.primary} />}
            </TouchableOpacity>
          </View>



          {errorMsg ? (
            <View style={{ backgroundColor: 'rgba(220,38,38,0.2)', padding: 15, borderRadius: 10, marginBottom: 20 }}>
              <Text style={{ color: '#ef4444', textAlign: 'center' }}>{errorMsg}</Text>
            </View>
          ) : null}

          {vouchers.length === 0 && !isLoading && !errorMsg ? (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 10, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 16 }}>No vouchers found.</Text>
              <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 13, marginTop: 6 }}>Generate some from the Generate tab.</Text>
            </View>
          ) : null}

          {Object.entries(grouped).map(([prof, batches]) => (
            <View key={prof} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>{prof}</Text>
                <View style={{ height: 1, flex: 1, backgroundColor: colors.glassBorder, opacity: 0.5 }} />
              </View>

              {Object.entries(batches).sort((a, b) => b[0].localeCompare(a[0])).map(([comment, users]) => {
                const groupKey = `${prof}-${comment}`;
                const isUnknown = comment === 'Old / Unknown';
                
                const originalCountMatch = comment.match(/\|\s*(\d{4})$/);
                const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : users.length;
                
                const availableVouchers = users.filter((u: any) => {
                  const uptime = u.uptime || '0s';
                  const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
                  const hasKillSched = schedulers.some((s: any) => s.name === `kill_${u.name}`);
                  const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline || hasKillSched;
                  return !hasBeenUsed;
                });
                
                const usedCount = originalCount - availableVouchers.length;
                const remainingCount = availableVouchers.length;
                const displayTime = comment.split(' | ')[0];
                
                return (
                  <View key={comment} style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: colors.cardBg, 
                    paddingVertical: 10, 
                    paddingHorizontal: 12, 
                    borderRadius: 10, 
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: colors.glassBorder
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>{displayTime}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        {!isUnknown && (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.glassBorder, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: colors.textMuted, fontSize: 10 }}>Total: </Text>
                              <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>{originalCount}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: colors.primary, fontSize: 10 }}>Used: </Text>
                              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{usedCount}</Text>
                            </View>
                          </>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: '#22c55e', fontSize: 10 }}>Unused: </Text>
                          <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '700' }}>{remainingCount}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.glassBorder, width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => setSelectedBatch({ profile: prof, comment, users })}
                      >
                        <Ionicons name="information-circle-outline" size={20} color={colors.foreground} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: colors.primary, width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: printingGroup === groupKey ? 0.6 : 1 }}
                        onPress={() => handlePrintGroup(prof, comment, users)}
                        disabled={printingGroup === groupKey}
                      >
                        {printingGroup === groupKey
                          ? <ActivityIndicator color="#fff" size="small" style={{ transform: [{ scale: 0.7 }] }} />
                          : <Ionicons name={"print" as any} size={16} color="#fff" />
                        }
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: 'rgba(220,38,38,0.1)', width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.1)' }}
                        onPress={() => handleDeleteGroup(`${prof} (${comment})`, users)}
                        disabled={isDeleting || printingGroup === groupKey}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </View>
  );
}
