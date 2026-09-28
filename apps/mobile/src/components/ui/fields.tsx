import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { forwardRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDate, formatDateTime } from '../../lib/format';
import { useColors } from '../../theme/ThemeProvider';
import { Button, IconButton } from './Button';
import { Text } from './Text';

/** Label + control + hint/error; errors are announced to screen readers. */
export function FieldFrame({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text variant="label">
        {label}
        {required ? <Text color="danger"> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  /** Password fields get a show/hide toggle. */
  secure?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, required, error, hint, secure, multiline, style, ...props },
  ref,
) {
  const c = useColors();
  const [hidden, setHidden] = useState(Boolean(secure));
  return (
    <FieldFrame label={label} required={required} error={error} hint={hint}>
      <View
        style={[
          styles.inputRow,
          { borderColor: error ? c.danger : c.borderStrong, backgroundColor: c.surface },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={c.muted}
          secureTextEntry={hidden}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxFontSizeMultiplier={1.6}
          style={[styles.input, { color: c.fg }, multiline && styles.multiline, style]}
          {...props}
        />
        {secure ? (
          <IconButton
            icon={hidden ? 'eye' : 'eye-off'}
            label={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((v) => !v)}
          />
        ) : null}
      </View>
    </FieldFrame>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  description?: string | undefined;
}

/** Native-feeling select: a button that opens a searchable option list in a modal. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  required,
  error,
  hint,
  allowClear = false,
  clearLabel = 'None',
  disabled,
  searchable,
  onSearch,
  loading,
}: {
  label: string;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  searchable?: boolean;
  /** Server-side search (e.g. leads); otherwise options are filtered locally. */
  onSearch?: (text: string) => void;
  loading?: boolean;
  /** Label to show when the selected value is not among `options` (server search). */
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const selected = options.find((o) => o.value === value);
  const visible =
    onSearch || !text
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(text.toLowerCase()));
  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setText('');
  };
  return (
    <FieldFrame label={label} required={required} error={error} hint={hint}>
      <Pressable
        onPress={disabled ? undefined : () => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityHint="Opens a list of options"
        accessibilityState={{ disabled: Boolean(disabled) }}
        style={[
          styles.inputRow,
          styles.select,
          {
            borderColor: error ? c.danger : c.borderStrong,
            backgroundColor: c.surface,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <Text color={selected ? 'fg' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
          {selected?.label ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color={c.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <IconButton icon="x" label="Close" onPress={() => setOpen(false)} />
            <Text variant="heading" style={{ flex: 1 }} accessibilityRole="header">
              {label}
            </Text>
          </View>
          {searchable || onSearch ? (
            <View style={{ padding: 12 }}>
              <TextInput
                autoFocus
                value={text}
                onChangeText={(next) => {
                  setText(next);
                  onSearch?.(next);
                }}
                placeholder="Search"
                placeholderTextColor={c.muted}
                accessibilityLabel={`Search ${label}`}
                style={[
                  styles.input,
                  styles.inputRow,
                  { color: c.fg, borderColor: c.borderStrong, backgroundColor: c.surface },
                ]}
              />
            </View>
          ) : null}
          <FlatList
            data={visible}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              allowClear ? (
                <OptionRow label={clearLabel} selected={!value} onPress={() => pick(null)} />
              ) : null
            }
            ListEmptyComponent={
              <Text color="muted" style={{ padding: 16 }}>
                {loading ? 'Searching…' : 'No options'}
              </Text>
            }
            renderItem={({ item }) => (
              <OptionRow
                label={item.label}
                description={item.description}
                selected={item.value === value}
                onPress={() => pick(item.value)}
              />
            )}
          />
        </SafeAreaView>
      </Modal>
    </FieldFrame>
  );
}

function OptionRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string | undefined;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.option,
        { borderBottomColor: c.border, backgroundColor: pressed ? c.surfaceMuted : c.surface },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description ? (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? <Feather name="check" size={18} color={c.primary} /> : null}
    </Pressable>
  );
}

/**
 * Native date / date-time picker. The value is an ISO string (or null); users
 * never type timestamps. Android shows date then time dialogs.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  required,
  error,
  hint,
  allowClear = true,
  minimumDate,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  mode?: 'date' | 'datetime';
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  allowClear?: boolean;
  minimumDate?: Date;
}) {
  const c = useColors();
  const [step, setStep] = useState<'closed' | 'date' | 'time'>('closed');
  const current = value ? new Date(value) : new Date();
  const shown = value ? (mode === 'date' ? formatDate(value) : formatDateTime(value)) : 'Not set';

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    if (event.type === 'dismissed' || !picked) {
      setStep('closed');
      return;
    }
    if (mode === 'datetime' && step === 'date' && Platform.OS === 'android') {
      const merged = new Date(current);
      merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      onChange(merged.toISOString());
      setStep('time');
      return;
    }
    setStep('closed');
    onChange(picked.toISOString());
  };

  return (
    <FieldFrame label={label} required={required} error={error} hint={hint}>
      <View style={styles.dateRow}>
        <Pressable
          onPress={() => setStep('date')}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shown}`}
          accessibilityHint="Opens a date picker"
          style={[
            styles.inputRow,
            styles.select,
            { flex: 1, borderColor: error ? c.danger : c.borderStrong, backgroundColor: c.surface },
          ]}
        >
          <Feather name="calendar" size={16} color={c.muted} />
          <Text color={value ? 'fg' : 'muted'} style={{ flex: 1 }}>
            {shown}
          </Text>
        </Pressable>
        {allowClear && value ? (
          <Button label="Clear" variant="ghost" onPress={() => onChange(null)} />
        ) : null}
      </View>
      {step !== 'closed' ? (
        <DateTimePicker
          value={current}
          mode={Platform.OS === 'android' ? step : mode}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onPicked}
          {...(minimumDate ? { minimumDate } : {})}
        />
      ) : null}
    </FieldFrame>
  );
}

export function SwitchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={[styles.switchRow]}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/** Horizontal segmented choice (small sets such as tabs or channels). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.segmented, { backgroundColor: c.surfaceMuted }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text variant="label" color={selected ? 'fg' : 'muted'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 46,
  },
  input: { flex: 1, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 96 },
  select: { paddingHorizontal: 12, gap: 8 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  option: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 6,
  },
});
