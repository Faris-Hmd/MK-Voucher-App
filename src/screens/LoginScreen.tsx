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
      <View style={[styles.card, localStyles.loginCard]}>
        <View style={localStyles.headerContainer}>
          <View style={[localStyles.iconWrapper, { backgroundColor: colors.secondary, borderColor: colors.glassBorder }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
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
            { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.glassBorder },
            loading && styles.buttonDisabled
          ]}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <View style={localStyles.buttonContent}>
              <Ionicons name="logo-google" size={18} color={colors.foreground} />
              <Text style={[localStyles.buttonText, { color: colors.foreground }]}>
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
  },
  loginCard: {
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
  googleButton: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
