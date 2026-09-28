import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../theme/ThemeProvider';
import { IconButton } from './Button';
import { Text } from './Text';

/**
 * Bottom sheet for short in-context forms. Android back and the backdrop close
 * it unless `busy` (a request is running).
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  busy = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  busy?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[styles.fill, { backgroundColor: c.overlay }]}
          onPress={close}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="caption" color="muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <IconButton icon="x" label="Close" onPress={close} disabled={busy} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingTop: 8 },
  body: { padding: 16, gap: 14 },
});
