import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AppTopbar from '../components/AppTopbar';
import { Button, Card, Input } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { apiRequest, type ApiError } from '../services/api';

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;

const ChangePasswordScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();
  const email = user?.email || '';
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const handleSendReset = async () => {
    if (!email.trim()) {
      setSendError('Email address is not available for this account.');
      return;
    }

    setSending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      await apiRequest('/users/forgot-password', {
        method: 'POST',
        body: { email: email.trim() }
      });
      setSendSuccess('Reset instructions have been sent to your email.');
    } catch (err) {
      const apiError = err as ApiError;
      setSendError(apiError.message || 'Failed to send reset instructions.');
    } finally {
      setSending(false);
    }
  };

  const handleResetPassword = async () => {
    setResetError(null);
    setResetSuccess(null);

    if (!token.trim()) {
      setResetError('Reset token is required.');
      return;
    }
    if (!newPassword.trim()) {
      setResetError('New password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    if (!passwordRegex.test(newPassword)) {
      setResetError('Password must include at least one letter and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    setResetting(true);

    try {
      await apiRequest('/users/reset-password', {
        method: 'POST',
        body: { token: token.trim(), newPassword }
      });
      setResetSuccess('Password updated successfully.');
      setToken('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const apiError = err as ApiError;
      setResetError(apiError.message || 'Failed to reset password.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search security..." />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[colors.brand, colors.brandSoft]} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <Feather name="shield" size={20} color="#ffffff" />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Change Password</Text>
                <Text style={styles.heroSubtitle}>
                  Protect your account with a secure password update.
                </Text>
              </View>
            </View>
          </LinearGradient>

          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Send Reset Email</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
              We will email a reset token to {email || 'your registered email address'}.
            </Text>
            {sendSuccess ? (
              <View style={styles.successBanner}>
                <Feather name="check-circle" size={14} color="#22c55e" />
                <Text style={styles.successText}>{sendSuccess}</Text>
              </View>
            ) : null}
            {sendError ? (
              <View style={styles.errorBanner}>
                <Feather name="alert-triangle" size={14} color="#f87171" />
                <Text style={styles.errorText}>{sendError}</Text>
              </View>
            ) : null}
            <Button
              label={sending ? 'Sending...' : 'Send Reset Email'}
              onPress={handleSendReset}
              disabled={sending || !email}
              loading={sending}
            />
          </Card>

          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Apply Reset Token</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
              Paste the token from your email and set a new password.
            </Text>
            <Input
              label="Reset Token"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              placeholder="Enter reset token"
            />
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="Enter new password"
              helperText="At least 8 characters with letters and numbers."
            />
            <Input
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm new password"
            />
            {resetSuccess ? (
              <View style={styles.successBanner}>
                <Feather name="check-circle" size={14} color="#22c55e" />
                <Text style={styles.successText}>{resetSuccess}</Text>
              </View>
            ) : null}
            {resetError ? (
              <View style={styles.errorBanner}>
                <Feather name="alert-triangle" size={14} color="#f87171" />
                <Text style={styles.errorText}>{resetError}</Text>
              </View>
            ) : null}
            <Button
              label={resetting ? 'Updating...' : 'Update Password'}
              onPress={handleResetPassword}
              disabled={resetting}
              loading={resetting}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ChangePasswordScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    marginBottom: 16
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroText: {
    flex: 1
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700'
  },
  heroSubtitle: {
    color: '#e0e7ff',
    fontSize: 12,
    marginTop: 4
  },
  sectionCard: {
    marginBottom: 16,
    gap: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600'
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 12,
    padding: 12
  },
  successText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderRadius: 12,
    padding: 12
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  }
});
