import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { useTheme } from '../../theme/ThemeProvider';

type EmptyStateProps = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const EmptyState = ({ title, message, actionLabel, onAction }: EmptyStateProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.button} />
      ) : null}
    </View>
  );
};

export default EmptyState;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12
  },
  title: {
    fontSize: 14,
    fontWeight: '600'
  },
  message: {
    fontSize: 12,
    textAlign: 'center'
  },
  button: {
    marginTop: 8
  }
});
