import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getAuth, signInWithCredential, GoogleAuthProvider } from '@react-native-firebase/auth';

// Configure Google Sign-In with our Web Client ID
GoogleSignin.configure({
  webClientId: '607302972148-9abl48jgvgijte8mpqi0ogbb4623g20a.apps.googleusercontent.com',
});

export default function LoginScreen() {
  const { colors, styles } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      // Check play services
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Perform sign in
      const signInResult = await GoogleSignin.signIn();
      
      if (signInResult.type !== 'success') {
        throw new Error('Google Sign-In was cancelled or failed.');
      }

      const idToken = signInResult.data.idToken;
      if (!idToken) {
        throw new Error('Google Sign-In failed: No ID Token retrieved.');
      }

      // Authenticate with Firebase
      const authInstance = getAuth();
      const googleCredential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(authInstance, googleCredential);
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      Alert.alert(
        'Authentication Error',
        error.message || 'Something went wrong during Google Sign-In. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, localStyles.container]}>
      {/* Background decoration circles (vibrant glow) */}
      <View style={[localStyles.glowCircle, { backgroundColor: colors.primary, top: '20%', left: '-10%' }]} />
      <View style={[localStyles.glowCircle, { backgroundColor: colors.accent, bottom: '20%', right: '-10%' }]} />

      <View style={[styles.card, localStyles.loginCard]}>
        <View style={localStyles.headerContainer}>
          <View style={[localStyles.iconWrapper, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}>
            <Ionicons name="shield-checkmark-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[localStyles.title, { color: colors.foreground }]}>MK Manager</Text>
          <Text style={[localStyles.subtitle, { color: colors.textMuted }]}>
            Voucher Control System
          </Text>
        </View>

        <View style={[localStyles.divider, { backgroundColor: colors.glassBorder }]} />

        <Text style={[localStyles.infoText, { color: colors.textMuted }]}>
          Please sign in with your Google account to access administrative tools.
        </Text>

        <TouchableOpacity
          style={[
            styles.button,
            localStyles.googleButton,
            { backgroundColor: colors.foreground },
            loading && styles.buttonDisabled
          ]}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <View style={localStyles.buttonContent}>
              <Ionicons name="logo-google" size={20} color={colors.background} />
              <Text style={[localStyles.buttonText, { color: colors.background }]}>
                Sign In with Google
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
    opacity: 0.15,
  },
  loginCard: {
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
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
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
    lineHeight: 20,
    marginVertical: 15,
  },
  googleButton: {
    width: '100%',
    height: 52,
    justifyContent: 'center',
    marginTop: 15,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
