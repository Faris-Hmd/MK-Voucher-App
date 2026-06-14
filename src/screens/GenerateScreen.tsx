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
  const { colors } = useTheme();

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

  const noProfiles = profiles.length === 0 && !isLoading;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Step 1: Select Profile */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Select Profile
        </Text>
        <TouchableOpacity onPress={loadProfiles} disabled={isLoading} style={{ padding: 4 }}>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh" size={16} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {noProfiles ? (
        <View style={[local.card, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, padding: 30, alignItems: 'center' }]}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
            No profiles found. Add one in the Profiles tab first.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 20 }}>
          {profiles.map((prof) => {
            const isSelected = selectedProfile === prof.name;
            const comment = (prof as any).comment || '';
            const isDataBased = comment.includes('LIMIT:');
            
            // Parse limits for subtitle display
            let limitSub = 'Time-Based';
            if (isDataBased) {
              const parts = comment.split('|');
              const limitPart = parts.find((pt: string) => pt.startsWith('LIMIT:'));
              if (limitPart) {
                limitSub = `Limit: ${limitPart.split(':')[1]} MB`;
              } else {
                limitSub = 'Data-Based';
              }
            }

            return (
              <TouchableOpacity
                key={prof['.id'] || prof.name}
                activeOpacity={0.8}
                onPress={() => setSelectedProfile(prof.name)}
                style={[
                  local.profileItem,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: isSelected ? colors.primary : colors.glassBorder,
                  },
                  isSelected && { backgroundColor: colors.primary + '0a' }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={[local.iconContainer, { backgroundColor: colors.secondary }]}>
                    <Ionicons 
                      name={(isDataBased ? "server-outline" : "time-outline") as any} 
                      size={16} 
                      color={isSelected ? colors.primary : colors.textMuted} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>
                      {prof.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      {limitSub}
                    </Text>
                  </View>
                </View>
                <Ionicons 
                  name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
                  size={20} 
                  color={isSelected ? colors.primary : colors.glassBorder} 
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Step 2: Voucher Details */}
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
        Voucher Details
      </Text>

      <View style={[local.card, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder, padding: 14, marginBottom: 20 }]}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Quantity */}
          <View style={{ flex: 1.2 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Quantity
            </Text>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              borderWidth: 1.5, 
              borderColor: colors.glassBorder, 
              borderRadius: 12,
              backgroundColor: colors.inputBg,
              paddingHorizontal: 12,
              height: 42,
            }}>
              <Ionicons name="apps-outline" size={14} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={{ 
                  flex: 1,
                  fontSize: 13, 
                  fontWeight: '600', 
                  color: colors.foreground, 
                  padding: 0,
                }}
                value={voucherCount}
                onChangeText={setVoucherCount}
                keyboardType="numeric"
                placeholder="e.g. 50"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Digits selector */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Length
            </Text>
            <FloatingDropdown
              icon="key-outline"
              selected={voucherLength}
              options={LENGTH_OPTIONS}
              onSelect={setVoucherLength}
              placeholder="Select length"
            />
          </View>
        </View>
      </View>

      {/* Generate Button */}
      <TouchableOpacity
        style={[
          local.generateBtn,
          { backgroundColor: colors.primary },
          (!selectedProfile || isGenerating) && { opacity: 0.5 },
        ]}
        onPress={handleGenerate}
        disabled={!selectedProfile || isGenerating}
        activeOpacity={0.85}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="ticket" size={18} color="#fff" />
            <Text style={local.generateBtnText}>
              Generate {voucherCount} · {selectedProfile}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 10,
  },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    height: 42,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  floatingList: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  floatingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  floatingItemText: {
    fontSize: 13,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
});
