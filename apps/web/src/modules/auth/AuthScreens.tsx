'use client';

import { Alert, Button, Field, Input } from '@crm/ui';
import { forgotPasswordSchema, loginRequestSchema, resetPasswordSchema } from '@crm/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { safeNextPath } from '@/components/auth/AuthGate';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';

function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5">
          <span
            aria-hidden
            className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary font-bold text-primary-fg"
          >
            C
          </span>
          <h1 className="text-lg font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function LoginScreen() {
  const { login, status } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNextPath(search.get('next'));
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(loginRequestSchema, { defaultValues: { email: '', password: '' } });
  const { register, handleSubmit, formState } = form;

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, next, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      router.replace(next);
    } catch (error) {
      setFormError(applyServerErrors(form, error) ?? errorMessage(error));
    }
  });

  return (
    <AuthCard title="Sign in" description="Use your work email and password.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {search.get('reason') === 'expired' && !formError && (
          <Alert tone="info">Your session ended. Sign in again to continue.</Alert>
        )}
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Email" required error={formState.errors.email?.message}>
          <Input type="email" autoComplete="username" autoFocus {...register('email')} />
        </Field>
        <Field label="Password" required error={formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api().v1.auth.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">
            If an account exists for that email, a reset link is on its way. It expires in one hour.
          </Alert>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Email" required error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" autoFocus {...register('email')} />
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={formState.isSubmitting}
          >
            Send reset link
          </Button>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordScreen() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const valid = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => api().v1.auth.verifyResetToken(token),
    enabled: token.length > 0,
    retry: false,
  });
  const form = useZodForm(resetPasswordSchema, { defaultValues: { token, newPassword: '' } });
  const { register, handleSubmit, formState } = form;
  const reset = useMutation({
    mutationFn: (values: { token: string; newPassword: string }) =>
      api().v1.auth.resetPassword(values.token, values.newPassword),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ token, newPassword: values.newPassword });
      setDone(true);
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  if (!token || valid.error) {
    return (
      <AuthCard title="This link is not valid">
        <Alert tone="danger">The reset link is invalid or has expired. Request a new one.</Alert>
        <Link
          href="/forgot-password"
          className="mt-4 block text-center text-sm text-primary hover:underline"
        >
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">Your password was changed. Other sessions were signed out.</Alert>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <input type="hidden" {...register('token')} />
          <Field
            label="New password"
            required
            hint="At least 8 characters with a letter and a number"
            error={formState.errors.newPassword?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              autoFocus
              disabled={valid.isPending}
              {...register('newPassword')}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={reset.isPending}
            disabled={valid.isPending}
          >
            Set new password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
