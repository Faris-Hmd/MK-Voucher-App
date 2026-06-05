import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

interface PendingScreenProps {
  email: string | null;
}

export default function PendingScreen({ email }: PendingScreenProps) {
  const { colors, styles } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await GoogleSignin.signOut().catch(() => {});
      await signOut(getAuth());
    } catch (error: any) {
      console.error('Sign Out Error:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, localStyles.container]}>
      <View style={[styles.card, localStyles.pendingCard]}>
        <View style={localStyles.headerContainer}>
          <View style={[localStyles.iconWrapper, { backgroundColor: 'rgba(234, 179, 8, 0.06)', borderColor: 'rgba(234, 179, 8, 0.15)' }]}>
            <Ionicons name="time-outline" size={32} color="#eab308" />
          </View>
          <Text style={[localStyles.title, { color: colors.foreground }]}>Access Restricted</Text>
          <Text style={[localStyles.subtitle, { color: '#eab308' }]}>
            Pending Approval
          </Text>
        </View>

        <View style={[localStyles.divider, { backgroundColor: colors.glassBorder }]} />

        <Text style={[localStyles.infoText, { color: colors.textMuted }]}>
          Your Google account is registered but requires admin approval before you can access the router management tools.
        </Text>

        <View style={[localStyles.emailBadge, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}>
          <Ionicons name="mail-outline" size={14} color={colors.primary} />
          <Text style={[localStyles.emailText, { color: colors.foreground }]} numberOfLines={1}>
            {email || 'No email address'}
          </Text>
        </View>

        <Text style={[localStyles.instructionText, { color: colors.textMuted }]}>
          Please share your email with the administrator to request access. The screen will unlock once approved.
        </Text>

        <TouchableOpacity
          style={[
            styles.button,
            localStyles.signOutButton,
            { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.glassBorder },
            loading && styles.buttonDisabled
          ]}
          onPress={handleSignOut}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <View style={localStyles.buttonContent}>
              <Ionicons name="log-out-outline" size={18} color={colors.foreground} />
              <Text style={[localStyles.buttonText, { color: colors.foreground }]}>
                Sign Out / Use Other Account
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pendingCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  infoText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginVertical: 12,
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
    maxWidth: '100%',
  },
  emailText: {
    fontSize: 13,
    fontWeight: '500',
  },
  instructionText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  signOutButton: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    marginTop: 5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
