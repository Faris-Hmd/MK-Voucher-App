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
      {/* Background decoration circle */}
      <View style={[localStyles.glowCircle, { backgroundColor: '#eab308', top: '30%', alignSelf: 'center' }]} />

      <View style={[styles.card, localStyles.pendingCard]}>
        <View style={localStyles.headerContainer}>
          <View style={[localStyles.iconWrapper, { backgroundColor: 'rgba(234, 179, 8, 0.15)', borderColor: 'rgba(234, 179, 8, 0.3)' }]}>
            <Ionicons name="time-outline" size={40} color="#eab308" />
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
          <Ionicons name="mail-outline" size={16} color={colors.primary} />
          <Text style={[localStyles.emailText, { color: colors.foreground }]} numberOfLines={1}>
            {email || 'No email address'}
          </Text>
        </View>

        <Text style={[localStyles.instructionText, { color: colors.textMuted }]}>
          Please share your email with the administrator to request access. The screen will automatically unlock once approved.
        </Text>

        <TouchableOpacity
          style={[
            styles.button,
            localStyles.signOutButton,
            { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.glassBorder },
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
              <Ionicons name="log-out-outline" size={20} color={colors.foreground} />
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
    position: 'relative',
    overflow: 'hidden',
  },
  glowCircle: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    opacity: 0.08,
  },
  pendingCard: {
    width: '100%',
    maxWidth: 400,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 10,
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginVertical: 12,
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginVertical: 12,
    maxWidth: '100%',
  },
  emailText: {
    fontSize: 14,
    fontWeight: '600',
  },
  instructionText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 25,
    fontStyle: 'italic',
  },
  signOutButton: {
    width: '100%',
    height: 50,
    justifyContent: 'center',
    marginTop: 5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
