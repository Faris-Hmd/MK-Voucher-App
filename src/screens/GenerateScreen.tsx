import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, StyleSheet, Modal,
} from 'react-native';
import { useTheme } from '../ThemeContext';
import { fetchProfilesAPI, createVouchersAPI } from '../api';
import { Ionicons } from '@expo/vector-icons';

type Profile = { '.id': string; name: string };

interface DropdownOption { label: string; value: string }

// ── Floating dropdown (no internal label) ────────────────────────────────────
function FloatingDropdown({
  icon, selected, options, onSelect, placeholder, disabled,
}: {
  icon: string; selected: string;
  options: DropdownOption[]; onSelect: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<View>(null);

  const openMenu = () => {
    if (disabled) return;
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setPos({ top: y + h, left: x, width: w });
      setOpen(true);
    });
  };

  const selectedLabel = options.find(o => o.value === selected)?.label ?? selected;

  return (
    <View style={{ flex: 1 }}>
      <View ref={triggerRef}>
        <TouchableOpacity
          style={[
            local.trigger,
            { backgroundColor: colors.inputBg, borderColor: open ? colors.primary : colors.glassBorder },
          ]}
          onPress={openMenu}
          activeOpacity={0.7}
        >
          <Ionicons name={icon as any} size={14} color={colors.textMuted} style={{ marginRight: 7 }} />
          <Text style={[local.triggerText, { color: selected ? colors.foreground : colors.textMuted, flex: 1 }]}>
            {selected ? selectedLabel : (placeholder ?? 'Select…')}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[
          local.floatingList,
          { top: pos.top, left: pos.left, width: pos.width,
            backgroundColor: colors.cardBg, borderColor: colors.primary },
        ]}>
          {options.map((opt, i) => {
            const active = opt.value === selected;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  local.floatingItem,
                  { borderBottomColor: colors.glassBorder },
                  i === options.length - 1 && { borderBottomWidth: 0 },
                  active && { backgroundColor: colors.primary + '12' },
                ]}
                onPress={() => { onSelect(opt.value); setOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={[local.floatingItemText, { color: active ? colors.primary : colors.foreground }]}>
                  {opt.label}
                </Text>
                {active && <Ionicons name="checkmark" size={15} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────
function FieldLabel({ text, colors }: { text: string; colors: any }) {
  return <Text style={[local.fieldLabel, { color: colors.textMuted }]}>{text}</Text>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LENGTH_OPTIONS: DropdownOption[] = [
  { label: '5 digits', value: '5' },
  { label: '6 digits', value: '6' },
  { label: '7 digits', value: '7' },
  { label: '8 digits', value: '8' },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function GenerateScreen() {
  const { colors, styles } = useTheme();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [voucherCount, setVoucherCount] = useState('50');
  const [voucherLength, setVoucherLength] = useState('6');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    setIsLoading(true);
    try {
      const p = await fetchProfilesAPI();
      setProfiles(p);
      if (p.length > 0 && !selectedProfile) setSelectedProfile(p[0].name);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  const handleGenerate = async () => {
    if (!selectedProfile) {
      Alert.alert('No Profile', 'Select a profile first. Create one in the Profiles tab.');
      return;
    }
    let limitBytesTotal: number | undefined;
    const selectedProfObj = profiles.find(p => p.name === selectedProfile);
    if (selectedProfObj && (selectedProfObj as any).comment) {
      const parts = (selectedProfObj as any).comment.split('|');
      const limitPart = parts.find((pt: string) => pt.startsWith('LIMIT:'));
      if (limitPart) {
        const mb = parseInt(limitPart.split(':')[1], 10);
        if (!isNaN(mb) && mb > 0) {
          limitBytesTotal = mb * 1024 * 1024;
        }
      }
    }
    setIsGenerating(true);
    try {
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const comment = `${ts} | ${String(voucherCount).padStart(4,'0')}`;
      const results = await createVouchersAPI(selectedProfile, parseInt(voucherCount), parseInt(voucherLength), comment, limitBytesTotal);
      Alert.alert('Done!', `Generated ${results.length} vouchers for "${selectedProfile}".`);
    } catch (err: any) {
      Alert.alert('Failed', err.message || 'Could not generate vouchers.');
    } finally {
      setIsGenerating(false);
    }
  };

  const profileOptions: DropdownOption[] = profiles.map(p => ({ label: p.name, value: p.name }));
  const noProfiles = profiles.length === 0 && !isLoading;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[local.card, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>

        {/* ── Profile row ── */}
        <FieldLabel text="PROFILE" colors={colors} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FloatingDropdown
            icon="layers-outline"
            selected={selectedProfile}
            options={profileOptions}
            onSelect={setSelectedProfile}
            placeholder={isLoading ? 'Loading…' : noProfiles ? 'No profiles yet' : 'Select a profile'}
            disabled={noProfiles || isLoading}
          />
          {/* Refresh button — same height as trigger */}
          <TouchableOpacity
            onPress={loadProfiles}
            disabled={isLoading}
            style={[local.refreshBtn, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder }]}
          >
            {isLoading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="refresh" size={16} color={colors.primary} />}
          </TouchableOpacity>
        </View>

        {/* Profile Details Badge */}
        {selectedProfile && (() => {
          const profObj = profiles.find(p => p.name === selectedProfile);
          if (!profObj || !(profObj as any).comment) return null;
          
          const parts = (profObj as any).comment.split('|');
          const limitPart = parts.find((pt: string) => pt.startsWith('LIMIT:'));
          const endPart = parts.find((pt: string) => pt.startsWith('END_BY_USAGE:'));
          
          const limitVal = limitPart ? limitPart.split(':')[1] + ' MB' : 'Unlimited';
          
          return (
            <View style={{ 
              flexDirection: 'row', 
              gap: 8, 
              marginTop: -6,
              marginBottom: 14
            }}>
              <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '500' }}>
                  Limit: <Text style={{ color: colors.primary, fontWeight: '700' }}>{limitVal}</Text>
                </Text>
              </View>
              {endPart && (
                <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '500' }}>
                    End by usage only: <Text style={{ color: '#22c55e', fontWeight: '700' }}>Yes</Text>
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        <View style={[local.divider, { backgroundColor: colors.glassBorder, marginBottom: 14 }]} />

        {/* ── Count + Length ── */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          {/* Count */}
          <View style={{ flex: 1 }}>
            <FieldLabel text="COUNT" colors={colors} />
            <View style={[local.trigger, { backgroundColor: colors.inputBg, borderColor: colors.glassBorder }]}>
              <Ionicons name="grid-outline" size={14} color={colors.textMuted} style={{ marginRight: 7 }} />
              <TextInput
                style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.foreground, height: '100%' }}
                value={voucherCount}
                onChangeText={setVoucherCount}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Length */}
          <View style={{ flex: 1 }}>
            <FieldLabel text="LENGTH" colors={colors} />
            <FloatingDropdown
              icon="text-outline"
              selected={voucherLength}
              options={LENGTH_OPTIONS}
              onSelect={setVoucherLength}
            />
          </View>
        </View>
      </View>

      {/* ── Generate ── */}
      <TouchableOpacity
        style={[
          local.generateBtn,
          { backgroundColor: colors.primary },
          (!selectedProfile || isGenerating) && { opacity: 0.5 },
        ]}
        onPress={handleGenerate}
        disabled={!selectedProfile || isGenerating}
        activeOpacity={0.8}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={local.generateBtnText}>Generate Vouchers</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const TRIGGER_HEIGHT = 46;

const local = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 20 },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
    marginBottom: 6, textTransform: 'uppercase',
  },
  divider: { height: StyleSheet.hairlineWidth },
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12,
    height: TRIGGER_HEIGHT,           // ← consistent height for all fields
  },
  triggerText: { fontSize: 14, fontWeight: '500' },
  refreshBtn: {
    width: TRIGGER_HEIGHT,            // ← square, same as trigger height
    height: TRIGGER_HEIGHT,
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  floatingList: {
    position: 'absolute',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12,
    zIndex: 999,
  },
  floatingItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  floatingItemText: { fontSize: 14, fontWeight: '500' },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
  },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
