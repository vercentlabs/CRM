import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { useTheme } from '../../theme/ThemeProvider';

type ErrorStateProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const ErrorState = ({
  title = 'Something went wrong',
  message,
  actionLabel = 'Try Again',
  onAction
}: ErrorStateProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.destructive }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text> : null}
      {onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.button} />
      ) : null}
    </View>
  );
};

export default ErrorState;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8
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
    marginTop: 6
  }
});
