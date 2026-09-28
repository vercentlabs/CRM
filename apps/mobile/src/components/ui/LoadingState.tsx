import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type LoadingStateProps = {
  label?: string;
};

const LoadingState = ({ label = 'Loading...' }: LoadingStateProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brand} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
};

export default LoadingState;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8
  },
  label: {
    color: '#9aa1b5',
    fontSize: 12
  }
});
