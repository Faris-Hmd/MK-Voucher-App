import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';

type Step = {
  title: string;
  description: string;
  command?: string;
};

const SETUP_STEPS: Step[] = [
  {
    title: '1. Verify RouterOS Version',
    description: 'The REST API requires RouterOS 7.1 or newer. Run this command on your MikroTik to check:',
    command: '/system resource print',
  },
  {
    title: '2. Enable HTTP (WWW) Service',
    description: 'The app connects over HTTP on port 80. Make sure the www service is enabled:',
    command: '/ip service set www disabled=no port=80',
  },
  {
    title: '3. Set Router Credentials',
    description: 'Ensure your admin user has a password (e.g., admin) and belongs to the full group:',
    command: '/user set admin password=admin group=full',
  },
  {
    title: '4. Setup Hotspot Server Profile',
    description: 'Create a Server Profile. Note: HTML directory must be set correctly for the login page.',
    command: '/ip hotspot profile add name=hsprof1 hotspot-address=0.0.0.0 html-directory=hotspot',
  },
  {
    title: '5. Setup Hotspot Server',
    description: 'Create the server on your target interface (e.g., bridge or wlan1).',
    command: '/ip hotspot add name=hotspot1 interface=bridge profile=hsprof1 disabled=no',
  },
  {
    title: '6. Set User TTL (Important)',
    description: 'For voucher expiration scripts to work, set the Hotspot User TTL to 0 so the router doesn\'t keep stale info:',
    command: '/ip hotspot user profile set [find name=default] idle-timeout=none keepalive-timeout=none status-autorefresh=1m address-pool=none',
  },
  {
    title: '7. Connect Your Phone',
    description: 'Your phone MUST be connected to the MikroTik network (via Wi-Fi or LAN) for the app to reach the router. Then enter the router IP in the Settings tab.',
  },
];

type CompatRow = {
  version: string;
  supported: boolean;
  notes: string;
};

const COMPAT_TABLE: CompatRow[] = [
  { version: 'RouterOS 6.x',    supported: false, notes: 'No REST API. Not supported.' },
  { version: 'RouterOS 7.0',    supported: false, notes: 'REST API not yet available.' },
  { version: 'RouterOS 7.1',    supported: true,  notes: 'First version with REST API. Works.' },
  { version: 'RouterOS 7.2 – 7.3', supported: true, notes: 'Supported. Stable.' },
  { version: 'RouterOS 7.4+',   supported: true,  notes: '✅ Recommended. Best compatibility.' },
];

function CopyableCommand({ command, colors }: { command: string; colors: any }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TouchableOpacity
      style={[localStyles.commandBox, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}
      onPress={handleCopy}
      activeOpacity={0.8}
    >
      <Text style={[localStyles.commandText, { color: colors.foreground }]}>{command}</Text>
      <View style={localStyles.copyBadge}>
        <Ionicons
          name={copied ? 'checkmark-circle' : 'copy-outline'}
          size={14}
          color={copied ? '#22c55e' : colors.textMuted}
        />
        <Text style={[localStyles.copyLabel, { color: copied ? '#22c55e' : colors.textMuted }]}>
          {copied ? 'Copied!' : 'Tap to copy'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const { colors, styles } = useTheme();

  return (
    <ScrollView style={[styles.content, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Version compatibility card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
          <Text style={[styles.label, { marginBottom: 0 }]}>RouterOS Version Compatibility</Text>
        </View>
        {COMPAT_TABLE.map((row) => (
          <View
            key={row.version}
            style={[
              localStyles.compatRow,
              { borderBottomColor: colors.glassBorder },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: '500', fontSize: 13 }}>{row.version}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{row.notes}</Text>
            </View>
            <View style={[
              localStyles.badge,
              { backgroundColor: row.supported ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }
            ]}>
              <Ionicons
                name={row.supported ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={row.supported ? '#22c55e' : '#ef4444'}
              />
              <Text style={{ color: row.supported ? '#22c55e' : '#ef4444', fontSize: 11, fontWeight: '500', marginLeft: 4 }}>
                {row.supported ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Setup steps */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Ionicons name="terminal-outline" size={18} color={colors.primary} />
          <Text style={[styles.label, { marginBottom: 0 }]}>MikroTik CLI Setup Commands</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
          Run these commands in your MikroTik terminal (Winbox → Terminal, or SSH into the router):
        </Text>

        {SETUP_STEPS.map((step, idx) => (
          <View key={idx} style={[localStyles.stepContainer, { borderBottomColor: colors.glassBorder, borderBottomWidth: idx < SETUP_STEPS.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
            <Text style={{ color: colors.foreground, fontWeight: '500', fontSize: 14, marginBottom: 6 }}>{step.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: step.command ? 10 : 0, lineHeight: 18 }}>{step.description}</Text>
            {step.command && <CopyableCommand command={step.command} colors={colors} />}
          </View>
        ))}
      </View>

      {/* Tips card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ionicons name="bulb-outline" size={18} color={colors.primary} />
          <Text style={[styles.label, { marginBottom: 0 }]}>Troubleshooting Tips</Text>
        </View>
        {[
          { icon: 'wifi-outline',        tip: 'Your phone must be on the same network as the MikroTik router.' },
          { icon: 'phone-portrait-outline', tip: 'Use the router\'s local IP (e.g. 192.168.88.1), not a domain name.' },
          { icon: 'lock-open-outline',   tip: 'If using a custom user, make sure they are in the "full" group.' },
          { icon: 'reload-outline',      tip: 'After changing CLI settings, save them with /system backup save.' },
          { icon: 'alert-circle-outline',tip: 'If connection fails, try pinging the router IP from your phone\'s browser.' },
          { icon: 'shield-checkmark-outline', tip: 'If connecting remotely, ensure your router firewall and www services permit the connection.' },
        ].map((item, idx) => (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
            <Ionicons name={item.icon as any} size={16} color={colors.primary} style={{ marginTop: 1 }} />
            <Text style={{ color: colors.foreground, fontSize: 13, flex: 1, lineHeight: 18 }}>{item.tip}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  compatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stepContainer: {
    paddingVertical: 14,
  },
  commandBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 8,
  },
  commandText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '500',
  },
  copyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  copyLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
