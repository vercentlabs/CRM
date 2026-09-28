import { ApiClientError } from '@crm/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Controller,
  useForm,
  type Control,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { TextInputProps } from 'react-native';
import type { z } from 'zod';
import {
  DateTimeField,
  SelectField,
  SwitchField,
  TextField,
  type SelectOption,
} from '../ui/fields';

/**
 * React Hook Form bound to a shared @crm/validation schema, so the app
 * validates exactly like the API. Inputs hold strings; schemas coerce them.
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'> = {},
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({
    // The resolver's generic signature cannot express preprocess-heavy schemas precisely.
    resolver: zodResolver(schema as never) as never,
    mode: 'onTouched',
    ...options,
  });
}

/**
 * Maps API validation details (`body.email` or `email`) onto form fields and
 * returns a message for errors that are not tied to a known field.
 */
export function applyServerErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
  error: unknown,
): string | null {
  if (!(error instanceof ApiClientError)) return 'Something went wrong. Please try again.';
  if (error.status === 0)
    return 'You appear to be offline. Your changes are still here; try again.';
  if (error.status >= 500) return 'The server could not save this. Try again in a moment.';
  const known = new Set(Object.keys(form.getValues() ?? {}));
  const unmatched: string[] = [];
  for (const detail of error.details ?? []) {
    const field = detail.field.replace(/^(body|query|params)\./, '');
    if (known.has(field))
      form.setError(field as Path<T>, { type: 'server', message: detail.message });
    else unmatched.push(detail.message);
  }
  if (error.details?.length && unmatched.length === 0) return null;
  return unmatched[0] ?? error.message;
}

type Base<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  hint?: string;
};

const messageOf = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '') || undefined
    : undefined;

export function FormText<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  ...input
}: Base<T> & Omit<TextInputProps, 'value' | 'onChangeText'> & { secure?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          required={required}
          hint={hint}
          error={messageOf(fieldState.error)}
          value={field.value == null ? '' : String(field.value)}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          {...input}
        />
      )}
    />
  );
}

export function FormSelect<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  options,
  allowClear,
  clearLabel,
  placeholder,
}: Base<T> & {
  options: SelectOption[];
  allowClear?: boolean;
  clearLabel?: string;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField
          label={label}
          required={required}
          hint={hint}
          error={messageOf(fieldState.error)}
          options={options}
          value={field.value == null ? null : String(field.value)}
          onChange={(value) => field.onChange(value ?? '')}
          allowClear={allowClear}
          clearLabel={clearLabel}
          placeholder={placeholder}
        />
      )}
    />
  );
}

export function FormDate<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  mode = 'datetime',
}: Base<T> & { mode?: 'date' | 'datetime' }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DateTimeField
          label={label}
          required={required}
          hint={hint}
          mode={mode}
          error={messageOf(fieldState.error)}
          value={field.value ? String(field.value) : null}
          onChange={(iso) => field.onChange(iso ?? '')}
        />
      )}
    />
  );
}

export function FormSwitch<T extends FieldValues>({ control, name, label }: Base<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SwitchField label={label} value={Boolean(field.value)} onChange={field.onChange} />
      )}
    />
  );
}
