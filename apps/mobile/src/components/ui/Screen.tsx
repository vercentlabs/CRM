import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../theme/ThemeProvider';
import { IconButton } from './Button';
import { Text } from './Text';

/**
 * Standard screen frame: safe area, header (menu for top-level screens, back
 * for pushed ones), optional header actions, and scrollable or fixed content.
 */
export function Screen({
  title,
  subtitle,
  back = false,
  actions,
  scroll = false,
  children,
  contentStyle,
  keyboard = false,
}: {
  title: string;
  subtitle?: string | undefined;
  /** Pushed screen: show a back button instead of the menu. */
  back?: boolean;
  actions?: ReactNode;
  scroll?: boolean;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Forms: keep inputs above the keyboard. */
  keyboard?: boolean;
}) {
  const c = useColors();
  const navigation = useNavigation<NavigationProp<ParamListBase> & { openDrawer?: () => void }>();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        {back ? (
          <IconButton icon="arrow-left" label="Back" onPress={() => navigation.goBack()} />
        ) : navigation.openDrawer ? (
          <IconButton icon="menu" label="Open menu" onPress={() => navigation.openDrawer?.()} />
        ) : (
          <View style={{ width: 8 }} />
        )}
        <View style={styles.titleBox}>
          <Text variant="heading" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>{actions}</View>
      </View>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  title,
  action,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  title?: string;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>
      {title ? (
        <View style={styles.cardHeader}>
          <Text variant="heading" style={{ fontSize: 16 }} accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Label/value pairs for detail screens. */
export function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.detail}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      {typeof value === 'string' ||
      typeof value === 'number' ||
      value === null ||
      value === undefined ? (
        <Text>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" color="muted" style={styles.sectionTitle} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleBox: { flex: 1, paddingHorizontal: 4 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detail: { gap: 2, paddingVertical: 4 },
  section: { gap: 10 },
  sectionTitle: { fontWeight: '600', letterSpacing: 0.5 },
});
