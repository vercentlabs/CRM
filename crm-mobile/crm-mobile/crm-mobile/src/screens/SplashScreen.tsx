import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { GradientText } from '../components/ui';

const SplashScreen = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const spinValue = useRef(new Animated.Value(0)).current;
  const splashImage = require('../../assets/splash-icon.png');

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  return (
    <LinearGradient
      colors={colors.authGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <View style={[styles.logoGlow, { backgroundColor: colors.brandMuted }]} />
            <LinearGradient
              colors={[colors.brand, colors.brandSoft]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logo}
            >
              <Image source={splashImage} style={styles.logoImage} resizeMode="contain" />
            </LinearGradient>
          </View>

          <GradientText style={styles.title} colors={[colors.brand, colors.brandSoft]}>
            CRM Enterprise
          </GradientText>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Customer Relationship Management{'\n'}System
          </Text>

          <View style={styles.loaderSection}>
            <Animated.View
              style={[
                styles.spinner,
                {
                  borderColor: colors.border,
                  borderTopColor: colors.brand,
                  transform: [
                    {
                      rotate: spinValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Text style={[styles.loaderText, { color: colors.mutedForeground }]}>
              Loading your workspace...
            </Text>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Feather name="shield" size={16} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Secure & Reliable
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Feather name="zap" size={16} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Fast & Efficient
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoGlow: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#d7d9e6',
    fontSize: 14,
    lineHeight: 20,
  },
  loaderSection: {
    marginTop: 28,
    alignItems: 'center',
  },
  spinner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: '#2f3356',
    borderTopColor: '#7c5cff',
  },
  loaderText: {
    marginTop: 12,
    color: '#9aa1b5',
    fontSize: 14,
  },
  infoRow: {
    marginTop: 28,
    alignItems: 'center',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoText: {
    marginLeft: 8,
    color: '#9aa1b5',
    fontSize: 14,
  },
});
