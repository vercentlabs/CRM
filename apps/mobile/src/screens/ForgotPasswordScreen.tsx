import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiRequest, type ApiError } from '../services/api';
import { Button, Input } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation/RootNavigator';

const ForgotPasswordScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme } = useTheme();
  const { colors } = theme;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const splashImage = require('../../assets/splash-icon.png');

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest('/users/forgot-password', {
        method: 'POST',
        body: { email: email.trim() }
      });
      setSuccess(
        'Password reset instructions have been sent to your email. Please check your inbox.'
      );
      setEmail('');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={colors.authGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <View style={[styles.logoGlow, { backgroundColor: colors.brandMuted }]} />
            <LinearGradient
              colors={[colors.brand, colors.brandSoft]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logo}
            >
              <Image source={splashImage} style={styles.logoImage} resizeMode="contain" />
            </LinearGradient>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.brand }]}>Reset Password</Text>
              <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}
              >
                Enter your email to receive reset instructions.
              </Text>
            </View>

            <View style={styles.cardBody}>
              {success ? (
                <View style={styles.messageBox}>
                  <Feather name="check-circle" size={16} color="#22c55e" />
                  <Text style={styles.messageText}>{success}</Text>
                </View>
              ) : (
                <Input
                  label="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Enter your email"
                />
              )}

              {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

              <Button
                label={loading ? 'Sending...' : 'Send Reset Instructions'}
                onPress={handleSubmit}
                disabled={loading || Boolean(success)}
                loading={loading}
              />

              <Pressable style={styles.linkRow} onPress={() => navigation.navigate('ResetPassword')}>
                <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                  Already have a reset token?
                </Text>
              </Pressable>

              <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Login')}>
                <Text style={[styles.linkText, { color: colors.brand }]}>Back to sign in</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ForgotPasswordScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center'
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 18
  },
  logoGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(139, 92, 246, 0.35)'
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  logoImage: {
    width: 40,
    height: 40
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  cardHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: 'center'
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center'
  },
  cardSubtitle: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18
  },
  cardBody: {
    paddingHorizontal: 24,
    paddingBottom: 26,
    gap: 12
  },
  errorText: {
    fontSize: 12
  },
  linkRow: {
    alignItems: 'center',
    marginTop: 4
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600'
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: 12,
    padding: 12
  },
  messageText: {
    flex: 1,
    color: '#22c55e',
    fontSize: 12
  }
});
