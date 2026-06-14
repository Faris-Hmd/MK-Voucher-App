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
            height: 40,
          }]}
          onPress={openMenu}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>{value}</Text>
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
  const { colors } = useTheme();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [limitType, setLimitType] = useState<'time' | 'data'>('time');
  const [newProfileName, setNewProfileName] = useState('');
  const [days, setDays] = useState('0');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [dataLimit, setDataLimit] = useState('');
  const [printLabel, setPrintLabel] = useState('');

  // Edit Modal State
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Script Modal State
  const [scriptModal, setScriptModal] = useState(false);
  const [scriptTarget, setScriptTarget] = useState<any>(null);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setIsLoading(true);
    try { setProfiles(await fetchProfilesAPI()); }
    catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  const getValidity = () => {
    if (limitType === 'data') return 'unlimited';
    let v = '';
    if (days && days !== '0') v += `${days}d`;
    if (hours && hours !== '0') v += `${hours}h`;
    if (minutes && minutes !== '0') v += `${minutes}m`;
    return v || '1h';
  };

  const handleCreate = async () => {
    if (!newProfileName.trim()) { Alert.alert('Error', 'Profile name is required.'); return; }
    
    let limitMB: number | undefined;
    if (limitType === 'data') {
      if (!dataLimit.trim()) {
        Alert.alert('Error', 'Data limit is required for Data-Based profiles.');
        return;
      }
      limitMB = parseInt(dataLimit.trim(), 10);
      if (isNaN(limitMB) || limitMB <= 0) {
        Alert.alert('Error', 'Invalid data limit. Please enter a positive number.');
        return;
      }
    }

    setIsCreating(true);
    try {
      const validity = limitType === 'time' ? getValidity() : 'unlimited';
      const isUnlimitedTime = limitType === 'data';
      await createProfileAPI(newProfileName.trim(), validity, limitMB, isUnlimitedTime, printLabel.trim());
      
      // Reset state
      setNewProfileName(''); 
      setDays('0'); 
      setHours('1'); 
      setMinutes('0');
      setDataLimit('');
      setPrintLabel('');
      setShowInlineCreate(false);
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

  const handleOpenScript = (p: any) => {
    setScriptTarget(p);
    setScriptModal(true);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profiles list header */}
        <View style={[local.rowBetween, { marginBottom: 16 }]}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            PROFILES ({profiles.length})
          </Text>
          <TouchableOpacity onPress={loadProfiles} disabled={isLoading} style={{ padding: 4 }}>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={16} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {profiles.length === 0 && !isLoading && !showInlineCreate && (
          <View style={[local.emptyBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>
            <Ionicons name="server-outline" size={32} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>No profiles yet.</Text>
          </View>
        )}

        {/* Profile items */}
        <View style={{ gap: 8, marginBottom: 12 }}>
          {profiles.map((p) => {
            const comment = (p as any).comment || '';
            const parts = comment.split('|');
            const limitPart = parts.find((pt: string) => pt.startsWith('LIMIT:'));
            const endPart = parts.find((pt: string) => pt.startsWith('END_BY_USAGE:'));
            const labelPart = parts.find((pt: string) => pt.startsWith('PRINT_LABEL:'));
            
            const limitText = limitPart ? `${limitPart.split(':')[1]} MB` : '';
            const labelText = labelPart ? labelPart.split(':')[1] : '';
            const isDataBased = !!limitText;

            return (
              <View
                key={p['.id']}
                style={[local.profileCard, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}
              >
                {/* Left Icon Badge */}
                <View style={[local.profileIconBox, { backgroundColor: colors.secondary }]}>
                  <Ionicons name={(isDataBased ? "server-outline" : "time-outline") as any} size={18} color={colors.primary} />
                </View>

                {/* Center Info */}
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>
                    {p.name}
                  </Text>
                  
                  {/* Badges / Subtexts */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {labelText ? (
                      <View style={[local.badge, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}>
                        <Ionicons name="pricetag-outline" size={9} color={colors.textMuted} style={{ marginRight: 3 }} />
                        <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '600' }}>
                          {labelText}
                        </Text>
                      </View>
                    ) : null}

                    {limitText ? (
                      <View style={[local.badge, { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.12)' }]}>
                        <Ionicons name="download-outline" size={9} color="#22c55e" style={{ marginRight: 3 }} />
                        <Text style={{ color: '#22c55e', fontSize: 9, fontWeight: '600' }}>
                          {limitText}
                        </Text>
                      </View>
                    ) : (
                      <View style={[local.badge, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}>
                        <Ionicons name="time-outline" size={9} color={colors.textMuted} style={{ marginRight: 3 }} />
                        <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '600' }}>
                          Time Uptime
                        </Text>
                      </View>
                    )}

                    {endPart ? (
                      <View style={[local.badge, { backgroundColor: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.12)' }]}>
                        <Ionicons name="stopwatch-outline" size={9} color="#f59e0b" style={{ marginRight: 3 }} />
                        <Text style={{ color: '#f59e0b', fontSize: 9, fontWeight: '600' }}>
                          Usage Stop
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => handleOpenScript(p)}
                    style={[local.actionButton, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="code-working" size={13} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setEditTarget(p); setEditName(p.name); setEditModal(true); }}
                    style={[local.actionButton, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={13} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(p)}
                    style={[local.actionButton, { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.12)' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* Inline Create Profile Form */}
        {showInlineCreate ? (
          <View style={[local.inlineCard, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>
            <View style={[local.rowBetween, { marginBottom: 14 }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>
                New Voucher Profile
              </Text>
              <TouchableOpacity onPress={() => setShowInlineCreate(false)} style={{ padding: 2 }}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Limit Type Select Segment Control */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <TouchableOpacity
                onPress={() => setLimitType('time')}
                style={[
                  local.segmentButton,
                  { backgroundColor: limitType === 'time' ? colors.primary + '0c' : colors.secondary, borderColor: limitType === 'time' ? colors.primary : colors.glassBorder }
                ]}
              >
                <Ionicons name="time-outline" size={14} color={limitType === 'time' ? colors.primary : colors.textMuted} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: limitType === 'time' ? colors.primary : colors.textMuted }}>
                  Time-Based
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setLimitType('data')}
                style={[
                  local.segmentButton,
                  { backgroundColor: limitType === 'data' ? colors.primary + '0c' : colors.secondary, borderColor: limitType === 'data' ? colors.primary : colors.glassBorder }
                ]}
              >
                <Ionicons name={"server-outline" as any} size={14} color={limitType === 'data' ? colors.primary : colors.textMuted} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: limitType === 'data' ? colors.primary : colors.textMuted }}>
                  Data-Based
                </Text>
              </TouchableOpacity>
            </View>

            {/* Profile Name Input */}
            <View style={{ marginBottom: 12 }}>
              <Text style={local.inlineLabel}>Profile Name</Text>
              <TextInput
                style={[local.inlineInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground }]}
                placeholder="e.g. 2 Hours"
                placeholderTextColor={colors.textMuted}
                value={newProfileName}
                onChangeText={setNewProfileName}
              />
            </View>

            {/* Print Label Input */}
            <View style={{ marginBottom: 12 }}>
              <Text style={local.inlineLabel}>Print Label (printed on voucher)</Text>
              <TextInput
                style={[local.inlineInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground }]}
                placeholder="e.g. 2 Hours Voucher"
                placeholderTextColor={colors.textMuted}
                value={printLabel}
                onChangeText={setPrintLabel}
              />
            </View>

            {/* Time-Based Selectors */}
            {limitType === 'time' ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={local.inlineLabel}>Validity Duration</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
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
              </View>
            ) : (
              /* Data-Based input */
              <View style={{ marginBottom: 16 }}>
                <Text style={local.inlineLabel}>Data Limit (MB)</Text>
                <TextInput
                  style={[local.inlineInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground }]}
                  placeholder="e.g. 1024"
                  placeholderTextColor={colors.textMuted}
                  value={dataLimit}
                  onChangeText={setDataLimit}
                  keyboardType="numeric"
                />
              </View>
            )}

            {/* Save and Cancel Actions */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[local.formButton, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}
                onPress={() => setShowInlineCreate(false)}
              >
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[local.formButton, { flex: 1, backgroundColor: colors.primary, borderColor: colors.primary }, isCreating && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Save Profile</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Dashed Button trigger */
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowInlineCreate(true)}
            style={[local.dashedButton, { borderColor: colors.glassBorder, backgroundColor: colors.secondary + '44' }]}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Create Profile</Text>
          </TouchableOpacity>
        )}

        {/* Rename Modal */}
        <Modal visible={editModal} transparent animationType="fade">
          <View style={local.overlay}>
            <View style={[local.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700', marginBottom: 14 }}>Rename Profile</Text>
              <View style={{ marginBottom: 16 }}>
                <Text style={local.inlineLabel}>Profile Name</Text>
                <TextInput
                  style={[local.inlineInput, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder, color: colors.foreground, marginBottom: 0 }]}
                  value={editName} onChangeText={setEditName} autoFocus
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[local.formButton, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}
                  onPress={() => setEditModal(false)}
                >
                  <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[local.formButton, { flex: 1, backgroundColor: colors.primary, borderColor: colors.primary }, isSaving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit} disabled={isSaving}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Script Modal */}
        <Modal visible={scriptModal} transparent animationType="slide">
          <View style={local.overlay}>
            <View style={[local.modalBox, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, maxHeight: '80%' }]}>
              <View style={[local.rowBetween, { marginBottom: 12 }]}>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }}>MikroTik Script</Text>
                <TouchableOpacity onPress={() => setScriptModal(false)}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ backgroundColor: colors.inputBg, borderRadius: 10, padding: 10, marginBottom: 14 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'monospace', fontSize: 11, lineHeight: 16 }}>
                  {scriptTarget && (() => {
                    const comment = scriptTarget.comment || '';
                    const isData = comment.includes('LIMIT:');
                    if (isData) {
                      return '# Voucher only ends by usage. No wall-clock timeout script generated.';
                    } else {
                      const parts = comment.split('|');
                      let validity = '1h'; // default fallback
                      const timePart = parts.find((pt: string) => pt.startsWith('TIME:'));
                      if (timePart) validity = timePart.split(':')[1];
                      return generateProfileScript(validity) || '# No script needed for unlimited time validity.';
                    }
                  })()}
                </Text>
              </ScrollView>
              <TouchableOpacity
                style={[local.formButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setScriptModal(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Got it</Text>
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
  dashedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  inlineCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 8,
  },
  inlineLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8e9196',
    marginBottom: 5,
  },
  inlineInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  formButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 32, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  profileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { width: '100%', maxWidth: 360, padding: 16, borderRadius: 16, borderWidth: 1 },
  durationInput: { borderRadius: 10, borderWidth: 1, paddingVertical: 8, width: '100%' },
});
