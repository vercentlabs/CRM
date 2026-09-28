import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GradientText } from '../components/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';

const LoginScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();
  const { theme } = useTheme();
  const { colors } = theme;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const hasFieldErrors = Boolean(fieldErrors.email || fieldErrors.password);
  const splashImage = require('../../assets/splash-icon.png');

  const handleLogin = async () => {
    const nextErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      nextErrors.email = 'Email is invalid.';
    }

    if (!password.trim()) {
      nextErrors.password = 'Password is required.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await login(email.trim(), password);
    if (!result.success) {
      setError(result.error || 'Login failed. Please try again.');
    }

    setSubmitting(false);
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

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <GradientText style={styles.cardTitle} colors={[colors.brand, colors.brandSoft]}>
                Welcome Back
              </GradientText>
              <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>
                Sign in to continue to your account
              </Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Email Address <Text style={[styles.required, { color: colors.destructive }]}>*</Text>
                </Text>
                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                    if (error) {
                      setError(null);
                    }
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Enter your email"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: fieldErrors.email ? colors.destructive : colors.inputBorder,
                      color: colors.foreground
                    }
                  ]}
                />
                {fieldErrors.email ? (
                  <Text style={[styles.fieldError, { color: colors.destructive }]}>
                    {fieldErrors.email}
                  </Text>
                ) : null}
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Password <Text style={[styles.required, { color: colors.destructive }]}>*</Text>
                </Text>
                <View style={styles.passwordField}>
                  <TextInput
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }
                      if (error) {
                        setError(null);
                      }
                    }}
                    secureTextEntry={!showPassword}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.mutedForeground}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      {
                        backgroundColor: colors.inputBg,
                        borderColor: fieldErrors.password ? colors.destructive : colors.inputBorder,
                        color: colors.foreground
                      }
                    ]}
                  />
                  <Pressable
                    onPress={() => setShowPassword((prev) => !prev)}
                    style={styles.eyeButton}
                  >
                    <Feather
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                </View>
                {fieldErrors.password ? (
                  <Text style={[styles.fieldError, { color: colors.destructive }]}>
                    {fieldErrors.password}
                  </Text>
                ) : null}
              </View>

              <View style={styles.forgotRow}>
                <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
                  <Text style={[styles.forgotText, { color: colors.brand }]}>
                    Forgot your password?
                  </Text>
                </Pressable>
              </View>

              {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

              <Pressable
                onPress={handleLogin}
                style={styles.button}
                disabled={submitting || hasFieldErrors}
              >
                <LinearGradient
                  colors={
                    submitting
                      ? [colors.brand, colors.brand]
                      : [colors.brand, colors.brandSoft]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    {submitting ? 'Signing in...' : 'Sign in'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logoGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
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
    elevation: 8,
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#11182b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.2)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 24,
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
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8
  },
  fieldError: {
    fontSize: 11,
    marginTop: 6
  },
  required: {
    color: '#f87171'
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 14
  },
  passwordField: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '500'
  },
  errorText: {
    fontSize: 12,
    marginBottom: 12
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
