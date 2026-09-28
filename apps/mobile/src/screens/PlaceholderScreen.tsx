import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AppTopbar from '../components/AppTopbar';
import { Card } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';

type PlaceholderScreenProps = {
  title: string;
  subtitle?: string;
};

const PlaceholderScreen = ({ title, subtitle }: PlaceholderScreenProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar />
        <View style={styles.content}>
          <Card style={styles.card}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {subtitle || 'This module is in progress. Data flows will be wired next.'}
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PlaceholderScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  card: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: '#11182b',
    borderWidth: 1,
    borderColor: '#1f2645'
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18
  }
});
