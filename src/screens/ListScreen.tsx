import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { globalStyles, colors } from '../theme';
import { fetchVouchersAPI, deleteVouchersAPI } from '../api';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function ListScreen() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadVouchers = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchVouchersAPI();
      setRawData(data);
      
      let usersArray = [];
      if (Array.isArray(data)) {
        usersArray = data;
      } else if (data && typeof data === 'object') {
        usersArray = [data]; // Handle single object case
      } else {
        throw new Error("Unexpected API response: " + JSON.stringify(data).substring(0, 100));
      }

      const filtered = usersArray.filter((u: any) => u.name !== 'admin' && u.name !== 'default' && u.name !== 'default-trial');
      setVouchers(filtered);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to router. Check your IP and credentials in Settings, and ensure your device is connected to the MikroTik network.');
      console.log('Failed to fetch vouchers', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVouchers();
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

  const handlePrintGroup = async (prof: string, users: any[]) => {
    try {
      // 1. Generate massive HTML grid for PDF
      let gridHtml = '';
      users.forEach(u => {
        gridHtml += `
          <div style="border: 1px dashed #666; padding: 10px; text-align: center; border-radius: 4px; display: inline-block; width: 12%; margin: 5px;">
            <div style="font-size: 8pt; font-weight: bold; margin-bottom: 2px;">WI-FI ACCESS</div>
            <div style="font-size: 7pt; border: 1px solid #999; padding: 2px; margin-bottom: 5px; display: inline-block;">${prof}</div>
            <div style="border-top: 1px dotted #ccc; margin-top: 5px; padding-top: 5px;">
              <div style="font-size: 14pt; font-weight: bold; font-family: monospace;">${u.name}</div>
            </div>
          </div>
        `;
      });

      const html = `
        <html>
          <head>
            <style>
              body { font-family: sans-serif; }
              @page { margin: 10mm; }
            </style>
          </head>
          <body>
            <div style="text-align: center; margin-bottom: 20px;">
              <h2>Profile: ${prof} (${users.length} Vouchers)</h2>
            </div>
            <div>
              ${gridHtml}
            </div>
          </body>
        </html>
      `;

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

      const safeProf = prof.replace(/[^a-zA-Z0-9_-]/g, '_');
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
      Alert.alert("Print Error", err.message);
    }
  };

  const grouped = vouchers.reduce((acc: Record<string, any[]>, user: any) => {
    const p = user.profile || 'unknown';
    if (!acc[p]) acc[p] = [];
    acc[p].push(user);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <ScrollView style={globalStyles.content}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={[globalStyles.title, {marginBottom: 0}]}>Vouchers ({vouchers.length})</Text>
        <TouchableOpacity onPress={loadVouchers} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color={colors.primary} /> : <Text style={{color: colors.primary, fontWeight: 'bold'}}>REFRESH</Text>}
        </TouchableOpacity>
      </View>

      {errorMsg ? (
        <View style={{ backgroundColor: 'rgba(220,38,38,0.2)', padding: 15, borderRadius: 10, marginBottom: 20 }}>
          <Text style={{ color: '#ef4444', textAlign: 'center' }}>{errorMsg}</Text>
        </View>
      ) : null}

      {vouchers.length === 0 && !isLoading && !errorMsg ? (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 15, borderRadius: 10, marginBottom: 20 }}>
          <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 10 }}>No vouchers found (or all were filtered out).</Text>
          <Text style={{ color: '#ccc', fontSize: 10 }}>Raw Data Type: {typeof rawData}. Is Array: {Array.isArray(rawData) ? 'Yes (length ' + rawData.length + ')' : 'No'}</Text>
          <Text style={{ color: '#ccc', fontSize: 10 }}>Sample: {JSON.stringify(Array.isArray(rawData) ? rawData.slice(0, 2) : rawData).substring(0, 300)}</Text>
        </View>
      ) : null}

      {Object.entries(grouped).map(([prof, users]) => (
        <View key={prof} style={globalStyles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.glassBorder, paddingBottom: 10 }}>
            <View>
              <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>{prof}</Text>
              <Text style={{color: colors.textMuted}}>{users.length} vouchers</Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
            <TouchableOpacity 
              style={[globalStyles.button, {flex: 1, backgroundColor: 'rgba(255,255,255,0.1)'}]} 
              onPress={() => handlePrintGroup(prof, users)}
            >
              <Text style={globalStyles.buttonText}>PDF / Print</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[globalStyles.button, {flex: 1, backgroundColor: 'rgba(220,38,38,0.2)'}]} 
              onPress={() => handleDeleteGroup(prof, users)}
              disabled={isDeleting}
            >
              <Text style={[globalStyles.buttonText, {color: '#ef4444'}]}>Delete</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {users.slice(0, 50).map((u, idx) => (
              <View key={u['.id'] || u.name || idx} style={{ backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={{ color: colors.foreground, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }}>{u.name || '?'}</Text>
              </View>
            ))}
            {users.length > 50 && (
              <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: 'bold' }}>+ {users.length - 50} more</Text>
              </View>
            )}
          </View>
        </View>
      ))}
      <View style={{height: 50}} />
    </ScrollView>
  );
}
