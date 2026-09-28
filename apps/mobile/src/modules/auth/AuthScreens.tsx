import { ApiClientError } from '@crm/api-client';
import { forgotPasswordSchema, loginRequestSchema, resetPasswordSchema } from '@crm/validation';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyServerErrors, FormText, useZodForm } from '../../components/forms/form';
import { FormError } from '../../components/forms/pickers';
import { Button, Text } from '../../components/ui';
import { api } from '../../lib/api';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';

function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {description ? <Text color="muted">{description}</Text> : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Sign-in with the v1 mobile flow: tokens come back in the body; the refresh
 * token goes to SecureStore and the access token stays in memory. Failures are
 * generic (never "unknown email" vs "wrong password"). With several
 * organizations the first active one opens; switch from the menu.
 */
export function LoginScreen() {
  const navigation = useNavigation();
  const { login, expired } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(loginRequestSchema, { defaultValues: { email: '', password: '' } });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 400))
        setFormError('Invalid email or password.');
      else if (error instanceof ApiClientError && error.status === 403)
        setFormError('Your account has no active organization access.');
      else if (error instanceof ApiClientError && error.status === 429)
        setFormError('Too many attempts. Wait a moment and try again.');
      else setFormError(applyServerErrors(form, error));
    }
  });
  return (
    <AuthFrame title="Sign in" description="Use your work email and password.">
      {expired && !formError ? (
        <Text color="muted">Your session ended. Sign in again to continue.</Text>
      ) : null}
      <FormError message={formError} />
      <FormText
        control={form.control}
        name="email"
        label="Email"
        required
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
      />
      <FormText
        control={form.control}
        name="password"
        label="Password"
        required
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
        returnKeyType="go"
      />
      <Button
        label="Sign in"
        variant="primary"
        onPress={() => void submit()}
        loading={form.formState.isSubmitting}
        testID="login-submit"
      />
      <Button
        label="Forgot your password?"
        variant="ghost"
        onPress={() => navigation.navigate('ForgotPassword')}
      />
    </AuthFrame>
  );
}

export function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api().v1.auth.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });
  return (
    <AuthFrame
      title="Reset your password"
      description="We will email you a link to set a new password."
    >
      {sent ? (
        <>
          <Text>
            If an account exists for that email, a reset link is on its way. It contains a reset
            code you can enter here.
          </Text>
          <Button
            label="I have a reset code"
            variant="primary"
            onPress={() => navigation.navigate('ResetPassword', {})}
          />
        </>
      ) : (
        <>
          <FormError message={formError} />
          <FormText
            control={form.control}
            name="email"
            label="Email"
            required
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Button
            label="Send reset link"
            variant="primary"
            onPress={() => void submit()}
            loading={form.formState.isSubmitting}
          />
        </>
      )}
      <Button
        label="Back to sign in"
        variant="ghost"
        onPress={() => navigation.navigate('Login')}
      />
    </AuthFrame>
  );
}

export function ResetPasswordScreen({ route }: RootScreenProps<'ResetPassword'>) {
  const navigation = useNavigation();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(resetPasswordSchema, {
    defaultValues: { token: route.params?.token ?? '', newPassword: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api().v1.auth.resetPassword(values.token, values.newPassword);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 400 && !error.details?.length)
        setFormError('The reset code is invalid or has expired. Request a new one.');
      else setFormError(applyServerErrors(form, error));
    }
  });
  return (
    <AuthFrame title="Choose a new password">
      {done ? (
        <>
          <Text>Your password was changed. Other sessions were signed out.</Text>
          <Button label="Sign in" variant="primary" onPress={() => navigation.navigate('Login')} />
        </>
      ) : (
        <>
          <FormError message={formError} />
          <FormText
            control={form.control}
            name="token"
            label="Reset code"
            required
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FormText
            control={form.control}
            name="newPassword"
            label="New password"
            required
            secureTextEntry
            autoComplete="new-password"
            hint="At least 8 characters with a letter and a number."
          />
          <Button
            label="Change password"
            variant="primary"
            onPress={() => void submit()}
            loading={form.formState.isSubmitting}
          />
          <Button
            label="Request a new link"
            variant="ghost"
            onPress={() => navigation.navigate('ForgotPassword')}
          />
        </>
      )}
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
});
