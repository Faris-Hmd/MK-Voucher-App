import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, StyleSheet, Modal
} from 'react-native';
import { useTheme } from '../ThemeContext';
import {
  fetchProfilesAPI, createProfileAPI, deleteProfileAPI,
  renameProfileAPI, getProfileNamesAPI, createVouchersAPI,
  generateProfileScript
} from '../api';
import { Ionicons } from '@expo/vector-icons';

type Profile = { '.id': string; name: string };
type ViewMode = 'generate' | 'profiles';

export default function GenerateScreen() {
  const { colors, styles } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('generate');
  
  // Shared state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate State
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [voucherCount, setVoucherCount] = useState('50');
  const [voucherLength, setVoucherLength] = useState('6');
  const [isGenerating, setIsGenerating] = useState(false);

  // Profiles State
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [validityDays, setValidityDays] = useState('0');
  const [validityHours, setValidityHours] = useState('1');
  const [validityMinutes, setValidityMinutes] = useState('0');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [scriptModalVisible, setScriptModalVisible] = useState(false);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setIsLoading(true);
    try {
      const p = await fetchProfilesAPI();
      setProfiles(p);
      if (p.length > 0 && !selectedProfile) {
        setSelectedProfile(p[0].name);
      }
    } catch (e) {
      console.log('Failed to load profiles');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedProfile) {
      Alert.alert('Error', 'Please select or create a profile first.');
      return;
    }
    setIsGenerating(true);
    try {
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const batchComment = `${timestamp} | ${String(voucherCount).padStart(4, '0')}`;
      
      const results = await createVouchersAPI(selectedProfile, parseInt(voucherCount), parseInt(voucherLength), batchComment);
      Alert.alert('Success', `Successfully generated ${results.length} vouchers!`);
    } catch (err: any) {
      Alert.alert('Generation Failed', err.message || 'Failed to generate vouchers.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!newProfileName || (!validityDays && !validityHours && !validityMinutes)) {
      Alert.alert('Error', 'Name and at least one validity value are required.');
      return;
    }
    
    const validity = getValidityString();

    setIsCreating(true);
    try {
      await createProfileAPI(newProfileName, validity);
      setNewProfileName('');
      setValidityDays('0');
      setValidityHours('1');
      setValidityMinutes('0');
      await loadProfiles();
      setViewMode('generate'); // Switch back to generate after creating
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProfile = (profile: Profile) => {
    Alert.alert('Delete Profile', `Delete "${profile.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteProfileAPI(profile['.id']);
          loadProfiles();
        } catch (err: any) { Alert.alert('Error', err.message); }
      }}
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingProfile) return;
    setIsSavingEdit(true);
    try {
      await renameProfileAPI(editingProfile['.id'], editName.trim());
      setEditModalVisible(false);
      loadProfiles();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setIsSavingEdit(false); }
  };

  const getValidityString = () => {
    let validity = '';
    if (validityDays && validityDays !== '0') validity += `${validityDays}d`;
    if (validityHours && validityHours !== '0') validity += `${validityHours}h`;
    if (validityMinutes && validityMinutes !== '0') validity += `${validityMinutes}m`;
    return validity || '1h';
  };


  return (
    <ScrollView style={[styles.content, { backgroundColor: colors.background }]}>
      
      {/* View Switcher */}
      <View style={[localStyles.switcher, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder }]}>
        <TouchableOpacity 
          style={[localStyles.switchBtn, viewMode === 'generate' && { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, elevation: 2 }]}
          onPress={() => setViewMode('generate')}
        >
          <Ionicons name="add-circle" size={16} color={viewMode === 'generate' ? colors.primary : colors.textMuted} />
          <Text style={[localStyles.switchText, { color: viewMode === 'generate' ? colors.foreground : colors.textMuted }]}>Generate</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[localStyles.switchBtn, viewMode === 'profiles' && { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, elevation: 2 }]}
          onPress={() => setViewMode('profiles')}
        >
          <Ionicons name="layers" size={16} color={viewMode === 'profiles' ? colors.primary : colors.textMuted} />
          <Text style={[localStyles.switchText, { color: viewMode === 'profiles' ? colors.foreground : colors.textMuted }]}>Profiles</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'generate' ? (
        <View style={[styles.card, { padding: 12 }]}>
          <Text style={[styles.label, { fontSize: 11, marginBottom: 8 }]}>Select Profile</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
            {profiles.map(p => (
              <TouchableOpacity
                key={p['.id']}
                style={{
                  backgroundColor: selectedProfile === p.name ? colors.primary : colors.inputBg,
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginRight: 6, marginBottom: 6,
                  borderWidth: 1, borderColor: selectedProfile === p.name ? colors.primary : colors.glassBorder,
                }}
                onPress={() => setSelectedProfile(p.name)}
              >
                <Text style={{ color: selectedProfile === p.name ? '#fff' : colors.foreground, fontWeight: '700', fontSize: 12 }}>{p.name}</Text>
              </TouchableOpacity>
            ))}
            {profiles.length === 0 && !isLoading && (
              <TouchableOpacity onPress={() => setViewMode('profiles')} style={{ padding: 6 }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>+ Create First Profile</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { fontSize: 11 }]}>Count</Text>
              <TextInput 
                style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                value={voucherCount} 
                onChangeText={setVoucherCount} 
                keyboardType="numeric" 
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { fontSize: 11 }]}>Length</Text>
              <TextInput 
                style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]} 
                value={voucherLength} 
                onChangeText={setVoucherLength} 
                keyboardType="numeric" 
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, { padding: 12, marginTop: 5 }, (!selectedProfile || isGenerating) && styles.buttonDisabled]}
            onPress={handleGenerate}
            disabled={!selectedProfile || isGenerating}
          >
            {isGenerating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.buttonText, { fontSize: 14 }]}>Generate Vouchers</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {/* Create Profile Section */}
          <View style={[styles.card, { padding: 12, marginBottom: 12 }]}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 10 }]}>New Profile</Text>
            <TextInput
              style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 12 }]}
              placeholder="Profile Name (e.g. 1 Hour)"
              placeholderTextColor={colors.textMuted}
              value={newProfileName}
              onChangeText={setNewProfileName}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { fontSize: 10, marginBottom: 4 }]}>Days</Text>
                <TextInput
                  style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]}
                  value={validityDays}
                  onChangeText={setValidityDays}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { fontSize: 10, marginBottom: 4 }]}>Hours</Text>
                <TextInput
                  style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]}
                  value={validityHours}
                  onChangeText={setValidityHours}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { fontSize: 10, marginBottom: 4 }]}>Minutes</Text>
                <TextInput
                  style={[styles.input, { padding: 10, fontSize: 14, marginBottom: 0 }]}
                  value={validityMinutes}
                  onChangeText={setValidityMinutes}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setScriptModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="code-working" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>View Script</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                Total Validity: <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  {getValidityString()}
                </Text>
              </Text>
            </View>
            <TouchableOpacity style={[styles.button, { padding: 12 }]} onPress={handleCreateProfile} disabled={isCreating}>
              {isCreating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.buttonText, { fontSize: 14 }]}>Create Profile</Text>}
            </TouchableOpacity>
          </View>

          {/* List Section */}
          <View style={[styles.card, { padding: 12 }]}>
            <Text style={[styles.label, { fontSize: 11, marginBottom: 10 }]}>Manage Profiles</Text>
            {profiles.map((p, idx) => (
              <View key={p['.id']} style={[localStyles.profileRow, { borderBottomWidth: idx < profiles.length - 1 ? 1 : 0, borderBottomColor: colors.glassBorder }]}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600', flex: 1 }}>{p.name}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => { setEditingProfile(p); setEditName(p.name); setEditModalVisible(true); }}>
                    <Ionicons name="pencil" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteProfile(p)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={localStyles.modalOverlay}>
          <View style={[localStyles.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', marginBottom: 15 }}>Rename Profile</Text>
            <TextInput style={[styles.input, { marginBottom: 20 }]} value={editName} onChangeText={setEditName} autoFocus />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: colors.inputBg }]} onPress={() => setEditModalVisible(false)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleSaveEdit}>
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Script Preview Modal */}
      <Modal visible={scriptModalVisible} transparent animationType="slide">
        <View style={localStyles.modalOverlay}>
          <View style={[localStyles.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700' }}>MikroTik Script Preview</Text>
              <TouchableOpacity onPress={() => setScriptModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ backgroundColor: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 20 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 }}>
                {generateProfileScript(getValidityString())}
              </Text>
            </ScrollView>
            <TouchableOpacity style={[styles.button, { width: '100%' }]} onPress={() => setScriptModalVisible(false)}>
              <Text style={styles.buttonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  switcher: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 15,
    gap: 3
  },
  switchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  switchText: {
    fontSize: 13,
    fontWeight: '700'
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  modalBox: {
    width: '100%',
    padding: 20,
    borderRadius: 15,
    borderWidth: 1
  }
});
