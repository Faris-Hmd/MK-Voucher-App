import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, StyleSheet, Modal, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '../ThemeContext';
import {
  fetchProfilesAPI, createProfileAPI, deleteProfileAPI,
  renameProfileAPI, generateProfileScript,
} from '../api';
import { Ionicons } from '@expo/vector-icons';

type Profile = { '.id': string; name: string };

// ── Duration Dropdown Selector ──────────────────────────────────
const DurationDropdown = ({
  label, value, options, onSelect,
}: {
  label: string; value: string;
  options: string[]; onSelect: (v: string) => void;
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = React.useRef<View>(null);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setPos({ top: y + h, left: x, width: w });
      setOpen(true);
    });
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View ref={triggerRef} style={{ width: '100%' }}>
        <TouchableOpacity
          style={[local.durationInput, { 
            backgroundColor: colors.inputBg, 
            borderColor: open ? colors.primary : colors.glassBorder, 
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'row',
            gap: 4,
            height: 50,
          }]}
          onPress={openMenu}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{value}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} style={{ marginTop: 2 }} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '500' }}>{label}</Text>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[
          {
            position: 'absolute',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: 200,
            backgroundColor: colors.cardBg,
            borderWidth: 1,
            borderColor: colors.primary,
            borderRadius: 12,
            overflow: 'hidden',
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
          }
        ]}>
          <ScrollView bounces={false}>
            {options.map((opt, i) => {
              const active = opt === value;
              return (
                <TouchableOpacity
                  key={opt}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderBottomWidth: i === options.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.glassBorder,
                    backgroundColor: active ? colors.primary + '12' : 'transparent',
                  }}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? colors.primary : colors.foreground }}>
                    {opt}
                  </Text>
                  {active && <Ionicons name="checkmark" size={13} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};


export default function VoucherProfilesScreen() {
  const { colors, styles } = useTheme();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [days, setDays] = useState('0');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scriptModal, setScriptModal] = useState(false);
  const [dataLimit, setDataLimit] = useState('');
  const [printLabel, setPrintLabel] = useState('');
  const [createModal, setCreateModal] = useState(false);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setIsLoading(true);
    try { setProfiles(await fetchProfilesAPI()); }
    catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  const getValidity = () => {
    if (isUnlimited) return 'unlimited';
    let v = '';
    if (days && days !== '0') v += `${days}d`;
    if (hours && hours !== '0') v += `${hours}h`;
    if (minutes && minutes !== '0') v += `${minutes}m`;
    return v || '1h';
  };

  const handleCreate = async () => {
    if (!newProfileName.trim()) { Alert.alert('Error', 'Profile name is required.'); return; }
    const limitMB = dataLimit.trim() ? parseInt(dataLimit.trim(), 10) : undefined;
    if (limitMB !== undefined && (isNaN(limitMB) || limitMB <= 0)) {
      Alert.alert('Error', 'Invalid data limit. Please enter a positive number.');
      return;
    }
    setIsCreating(true);
    try {
      await createProfileAPI(newProfileName.trim(), getValidity(), limitMB, isUnlimited, printLabel.trim());
      setNewProfileName(''); 
      setIsUnlimited(false); 
      setDays('0'); 
      setHours('1'); 
      setMinutes('0');
      setDataLimit('');
      setPrintLabel('');
      await loadProfiles();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setIsCreating(false); }
  };

  const handleDelete = (p: Profile) => {
    Alert.alert('Delete Profile', `Delete "${p.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteProfileAPI(p['.id']); loadProfiles(); }
        catch (err: any) { Alert.alert('Error', err.message); }
      }},
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editTarget) return;
    setIsSaving(true);
    try {
      await renameProfileAPI(editTarget['.id'], editName.trim());
      setEditModal(false); loadProfiles();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setIsSaving(false); }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profiles list header */}
      <View style={[local.rowBetween, { marginBottom: 16 }]}>
        <Text style={[local.sectionLabel, { color: colors.textMuted, marginBottom: 0 }]}>
          PROFILES ({profiles.length})
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => setCreateModal(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: colors.primary + '14',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Add Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={loadProfiles} disabled={isLoading} style={{ padding: 4 }}>
            {isLoading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="refresh" size={15} color={colors.primary} />}
          </TouchableOpacity>
        </View>
      </View>

      {profiles.length === 0 && !isLoading && (
        <View style={[local.emptyBox, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}>
          <Ionicons name="layers-outline" size={32} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>No profiles yet.</Text>
        </View>
      )}

      {profiles.map((p, i) => {
        const comment = (p as any).comment || '';
        const parts = comment.split('|');
        const limitPart = parts.find((pt: string) => pt.startsWith('LIMIT:'));
        const endPart = parts.find((pt: string) => pt.startsWith('END_BY_USAGE:'));
        const labelPart = parts.find((pt: string) => pt.startsWith('PRINT_LABEL:'));
        
        const limitText = limitPart ? `${limitPart.split(':')[1]} MB` : '';
        const labelText = labelPart ? labelPart.split(':')[1] : '';

        return (
          <View
            key={p['.id']}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.cardBg,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              borderRadius: 16,
              padding: 14,
              marginBottom: 10,
            }}
          >
            {/* Left Icon Badge */}
            <View style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: colors.primary + '12',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}>
              <Ionicons name="ticket-outline" size={20} color={colors.primary} />
            </View>

            {/* Center Info */}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }}>
                {p.name}
              </Text>
              
              {/* Badges / Subtexts */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {labelText ? (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.primary + '0a',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.primary + '1a',
                  }}>
                    <Ionicons name="pricetag-outline" size={10} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '600' }}>
                      {labelText}
                    </Text>
                  </View>
                ) : null}

                {limitText ? (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(16,185,129,0.06)',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: 'rgba(16,185,129,0.15)',
                  }}>
                    <Ionicons name="download-outline" size={10} color="#10b981" style={{ marginRight: 4 }} />
                    <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '600' }}>
                      {limitText}
                    </Text>
                  </View>
                ) : null}

                {endPart ? (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(245,158,11,0.06)',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: 'rgba(245,158,11,0.15)',
                  }}>
                    <Ionicons name="stopwatch-outline" size={10} color="#f59e0b" style={{ marginRight: 4 }} />
                    <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '600' }}>
                      Usage Stop
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setEditTarget(p); setEditName(p.name); setEditModal(true); }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.glassBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.inputBg,
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={14} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(p)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(239,68,68,0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(239,68,68,0.08)',
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* Create Profile Modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={local.overlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[local.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <View style={[local.cardHeader, { marginBottom: 16 }]}>
                <View style={[local.cardIconBox, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                </View>
                <Text style={[local.cardTitle, { color: colors.foreground }]}>New Profile</Text>
              </View>

              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                  Profile Name
                </Text>
                <TextInput
                  style={[local.nameInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground, marginBottom: 0 }]}
                  placeholder="e.g. 1 Hour"
                  placeholderTextColor={colors.textMuted}
                  value={newProfileName}
                  onChangeText={setNewProfileName}
                />
              </View>

              {/* Data Limit MB input */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                  Data Limit (MB)
                </Text>
                <TextInput
                  style={[local.nameInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground, marginBottom: 0 }]}
                  placeholder="Optional, e.g. 500"
                  placeholderTextColor={colors.textMuted}
                  value={dataLimit}
                  onChangeText={setDataLimit}
                  keyboardType="numeric"
                />
              </View>

              {/* Print Label input */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                  Print Label
                </Text>
                <TextInput
                  style={[local.nameInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground, marginBottom: 0 }]}
                  placeholder="e.g. 1 Hour Voucher"
                  placeholderTextColor={colors.textMuted}
                  value={printLabel}
                  onChangeText={setPrintLabel}
                />
              </View>

              {/* Unlimited time Switch */}
              <View style={[local.switchRow, { borderColor: colors.glassBorder }]}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '500' }}>Unlimited time (No timer)</Text>
                <Switch
                  value={isUnlimited} onValueChange={setIsUnlimited}
                  trackColor={{ false: colors.inputBg, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              {!isUnlimited && (
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                  <DurationDropdown 
                    label="Days" 
                    value={days} 
                    options={['0', '1', '7', '30', '45', '60', '90']} 
                    onSelect={setDays} 
                  />
                  <DurationDropdown 
                    label="Hours" 
                    value={hours} 
                    options={Array.from({ length: 25 }, (_, i) => String(i))} 
                    onSelect={setHours} 
                  />
                  <DurationDropdown 
                    label="Minutes" 
                    value={minutes} 
                    options={['0', '10', '20', '30', '40', '50']} 
                    onSelect={setMinutes} 
                  />
                </View>
              )}

              <View style={[local.rowBetween, { marginBottom: 16 }]}>
                <TouchableOpacity onPress={() => setScriptModal(true)} style={local.scriptBtn}>
                  <Ionicons name="code-working-outline" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>View Script</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  Validity: <Text style={{ color: colors.primary, fontWeight: '700' }}>{getValidity()}</Text>
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[local.createBtn, { flex: 1, backgroundColor: colors.secondary, marginTop: 0 }]}
                  onPress={() => setCreateModal(false)}
                >
                  <Text style={[local.createBtnText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[local.createBtn, { flex: 1, backgroundColor: colors.primary, marginTop: 0 }, isCreating && { opacity: 0.6 }]}
                  onPress={async () => {
                    await handleCreate();
                    setCreateModal(false);
                  }}
                  disabled={isCreating}
                >
                  {isCreating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={local.createBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={editModal} transparent animationType="fade">
        <View style={local.overlay}>
          <View style={[local.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>Rename Profile</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                Profile Name
              </Text>
              <TextInput
                style={[local.nameInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground, marginBottom: 0 }]}
                value={editName} onChangeText={setEditName} autoFocus
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[local.createBtn, { flex: 1, backgroundColor: colors.secondary }]}
                onPress={() => setEditModal(false)}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[local.createBtn, { flex: 1, backgroundColor: colors.primary }, isSaving && { opacity: 0.6 }]}
                onPress={handleSaveEdit} disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={local.createBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Script Modal */}
      <Modal visible={scriptModal} transparent animationType="slide">
        <View style={local.overlay}>
          <View style={[local.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, maxHeight: '80%' }]}>
            <View style={[local.rowBetween, { marginBottom: 14 }]}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700' }}>MikroTik Script</Text>
              <TouchableOpacity onPress={() => setScriptModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ backgroundColor: colors.inputBg, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'monospace', fontSize: 11.5, lineHeight: 18 }}>
                {isUnlimited 
                  ? '# Voucher only ends by usage. No wall-clock timeout script generated.'
                  : (generateProfileScript(getValidity()) || '# No script needed for unlimited time validity.')}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[local.createBtn, { backgroundColor: colors.primary }]}
              onPress={() => setScriptModal(false)}
            >
              <Text style={local.createBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 50 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 24 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  nameInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 14 },
  durationInput: { borderRadius: 12, borderWidth: 1, paddingVertical: 12, fontSize: 14, fontWeight: '600', width: '100%', textAlign: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  scriptBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 32, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingRight: 14, overflow: 'hidden' },
  profileAccent: { width: 4, height: '100%', borderRadius: 2, position: 'absolute', left: 0 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(0,0,0,0)', marginLeft: 8, backgroundColor: 'transparent' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { width: '100%', maxWidth: 360, padding: 20, borderRadius: 18, borderWidth: 1 },
});
