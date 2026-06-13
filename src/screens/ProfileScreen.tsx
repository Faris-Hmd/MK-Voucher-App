import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { getFirestore, doc, getDoc } from '@react-native-firebase/firestore';

interface UserProfile {
  name: string;
  email: string;
  approved: boolean;
  createdAt?: any;
}

export default function ProfileScreen() {
  const { colors, styles } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const currentUser = auth.currentUser;

  useEffect(() => {
    const fetchProfile = async () => {
      if (!currentUser?.email) {
        setLoading(false);
        return;
      }
      try {
        const db = getFirestore();
        const ref = doc(db, 'users', currentUser.email.toLowerCase());
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          setProfile({
            name: currentUser.displayName || 'Unknown',
            email: currentUser.email,
            approved: false,
          });
        }
      } catch {
        setProfile({
          name: currentUser.displayName || 'Unknown',
          email: currentUser.email ?? '',
          approved: false,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (e) {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        },
      },
    ]);
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>Loading profile…</Text>
      </View>
    );
  }

  const displayName = profile?.name || currentUser?.displayName || 'User';
  const displayEmail = profile?.email || currentUser?.email || '';

  const InfoRow = ({
    label,
    value,
    icon,
  }: {
    label: string;
    value: string;
    icon: string;
  }) => (
    <View style={[localStyles.infoRow, { borderBottomColor: colors.glassBorder }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon as any} size={15} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
          {label}
        </Text>
      </View>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );

  return (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {/* Avatar + Name */}
      <View style={[localStyles.avatarCard, { backgroundColor: colors.cardBg, borderColor: colors.glassBorder }]}>
        <View style={[localStyles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={localStyles.avatarText}>{initials(displayName)}</Text>
        </View>
        <Text style={[localStyles.displayName, { color: colors.foreground }]}>
          {displayName}
        </Text>
        <Text style={[localStyles.emailText, { color: colors.textMuted }]}>
          {displayEmail}
        </Text>

        {/* Status badge */}
        <View
          style={[
            localStyles.statusBadge,
            {
              backgroundColor: profile?.approved
                ? 'rgba(34,197,94,0.10)'
                : 'rgba(245,158,11,0.10)',
              borderColor: profile?.approved
                ? 'rgba(34,197,94,0.25)'
                : 'rgba(245,158,11,0.25)',
            },
          ]}
        >
          <View
            style={[
              localStyles.statusDot,
              { backgroundColor: profile?.approved ? '#22c55e' : '#f59e0b' },
            ]}
          />
          <Text
            style={[
              localStyles.statusText,
              { color: profile?.approved ? '#22c55e' : '#f59e0b' },
            ]}
          >
            {profile?.approved ? 'Approved' : 'Pending Approval'}
          </Text>
        </View>
      </View>

      {/* Account details */}
      <View style={styles.card}>
        <Text style={[styles.label, { marginBottom: 16 }]}>Account Details</Text>
        <InfoRow label="Full Name" value={displayName} icon="person-outline" />
        <InfoRow label="Email" value={displayEmail} icon="mail-outline" />
        <InfoRow
          label="Account Status"
          value={profile?.approved ? 'Active' : 'Awaiting Approval'}
          icon="shield-checkmark-outline"
        />
        <InfoRow
          label="Member Since"
          value={formatDate(profile?.createdAt)}
          icon="calendar-outline"
        />
      </View>

      {/* App info */}
      <View style={styles.card}>
        <Text style={[styles.label, { marginBottom: 16 }]}>App Info</Text>
        <InfoRow label="App" value="MK Voucher" icon="apps-outline" />
        <InfoRow label="Version" value="1.0.0" icon="code-working-outline" />
        <InfoRow label="Platform" value="MikroTik RouterOS" icon="wifi-outline" />
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={[localStyles.signOutBtn, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' }]}
        onPress={handleSignOut}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        <Text style={localStyles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  avatarCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  emailText: {
    fontSize: 13,
    marginBottom: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  signOutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
