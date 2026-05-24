import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../ThemeContext';
import { fetchVouchersAPI, deleteVouchersAPI, fetchActiveSessionsAPI } from '../api';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { loadConfig } from '../store';
import { Ionicons } from '@expo/vector-icons';

export default function ListScreen() {
  const { colors, styles } = useTheme();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [printingGroup, setPrintingGroup] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadVouchers = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [data, activeSessions] = await Promise.all([
        fetchVouchersAPI(),
        fetchActiveSessionsAPI().catch(() => [])
      ]);
      setRawData(data);
      
      const activeUserNames = new Set((activeSessions || []).map((s: any) => s.user));
      
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
      const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline;
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; color: #000; }
    @page { margin: 8mm; size: A4; }

    .page-header {
      text-align: center;
      padding-bottom: 8px;
      margin-bottom: 10px;
      border-bottom: 2px solid #000;
    }
    .page-header h1 {
      font-size: 14pt;
      font-weight: 800;
      letter-spacing: 1px;
    }
    .page-header p {
      font-size: 8pt;
      margin-top: 2px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 5px;
    }

    .voucher {
      border: 1px dashed #000;
      border-radius: 4px;
      padding: 7px 6px;
      text-align: center;
      page-break-inside: avoid;
    }
    .wifi-name {
      font-size: 6.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .profile-name {
      font-size: 8pt;
      font-weight: 600;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    .divider {
      border: none;
      border-top: 1px dotted #000;
      margin: 3px 0;
    }
    .code {
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: 2px;
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${printWifiName}</h1>
    <p>${profName} &mdash; ${batchTime} &mdash; ${availableToPrint.length} Vouchers</p>
  </div>
  <div class="grid">
    ${availableToPrint.map(u => `
    <div class="voucher">
      <div class="wifi-name">${printWifiName}</div>
      <div class="profile-name">${profName}</div>
      <hr class="divider"/>
      <div class="code">${u.name}</div>
    </div>`).join('')}
  </div>
</body>
</html>`;

      // 2. Generate PDF
      const { uri } = await Print.printToFileAsync({ html });
      
      // 3. Move to a persistent "vouchers" folder on device
      if (!FileSystem.documentDirectory) {
        throw new Error("File system not available on this device. Cannot save PDF.");
      }
      const vouchersDir = FileSystem.documentDirectory + 'vouchers/';
      const dirInfo = await FileSystem.getInfoAsync(vouchersDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(vouchersDir, { intermediates: true });
      }

      const safeProf = profName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeProf}_WIFI.pdf`;
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
    <ScrollView style={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800' }}>Batch Overview</Text>
        <TouchableOpacity onPress={loadVouchers} disabled={isLoading} style={{ backgroundColor: colors.glassBorder, padding: 8, borderRadius: 10 }}>
          {isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh" size={20} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      {!errorMsg && vouchers.length > 0 && (
        <View style={[styles.card, { padding: 15, marginBottom: 20, backgroundColor: colors.primary + '05', borderColor: colors.primary + '20' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.glassBorder }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Total</Text>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '900', marginTop: 2 }}>{stats.totalGenerated}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.glassBorder }}>
              <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Available</Text>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '900', marginTop: 2 }}>{stats.totalAvailable}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Used</Text>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '900', marginTop: 2 }}>{stats.totalUsed}</Text>
            </View>
          </View>
          
          <View style={{ height: 6, backgroundColor: colors.glassBorder, borderRadius: 3, marginTop: 15, overflow: 'hidden', flexDirection: 'row' }}>
            <View style={{ flex: stats.totalUsed, backgroundColor: colors.primary }} />
            <View style={{ flex: stats.totalAvailable, backgroundColor: '#22c55e' }} />
          </View>
        </View>
      )}

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
            
            // Parse original count from comment (last 4 digits after | )
            const originalCountMatch = comment.match(/\|\s*(\d{4})$/);
            const originalCount = originalCountMatch ? parseInt(originalCountMatch[1]) : users.length;
            
            // A voucher is "available" only if it exists, has no uptime, and has not been tagged with an expiration date in its comment
            const availableVouchers = users.filter((u: any) => {
              const uptime = u.uptime || '0s';
              const hasUptime = uptime !== '0s' && uptime !== '00:00:00';
              const hasBeenUsed = hasUptime || (u.comment && u.comment.includes('| EXP:')) || u.isCurrentlyOnline;
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

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: colors.primary, width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: printingGroup === groupKey ? 0.6 : 1 }}
                    onPress={() => handlePrintGroup(prof, comment, users)}
                    disabled={printingGroup === groupKey}
                  >
                    {printingGroup === groupKey
                      ? <ActivityIndicator color="#fff" size="small" style={{ transform: [{ scale: 0.7 }] }} />
                      : <Ionicons name={"print" as any} size={18} color="#fff" />
                    }
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ backgroundColor: 'rgba(220,38,38,0.1)', width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.1)' }}
                    onPress={() => handleDeleteGroup(`${prof} (${comment})`, users)}
                    disabled={isDeleting || printingGroup === groupKey}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ height: 50 }} />
    </ScrollView>
  );
}
