import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMenuCategoriesForRole } from './menuConfig';
import { useAuth } from '../context/AuthContext';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useTheme } from '../theme/ThemeProvider';

const iconFallback = 'circle';

const DrawerContent = (props: DrawerContentComponentProps) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { colors } = theme;
  const categories = getMenuCategoriesForRole(user?.roleId);
  const drawerPalette = {
    gradient: [colors.appShell, colors.appSidebar] as const,
    border: colors.border,
    text: colors.foreground,
    muted: colors.mutedForeground,
    accent: colors.brand,
    accentSoft: colors.brandSoft,
    itemActiveBg: colors.brandMuted,
    itemActiveBorder: colors.brandMuted
  };

  return (
    <LinearGradient colors={drawerPalette.gradient} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <DrawerContentScrollView {...props} contentContainerStyle={styles.scroll}>
          <View style={[styles.header, { borderBottomColor: drawerPalette.border }]}>
            <View style={[styles.logo, { backgroundColor: drawerPalette.accent }]}>
              <Text style={styles.logoText}>C</Text>
            </View>
            <View style={styles.brandBlock}>
              <Text style={[styles.brandTitle, { color: drawerPalette.text }]}>CRM</Text>
              <Text style={[styles.brandSubtitle, { color: drawerPalette.muted }]}>
                {user?.name || user?.email || 'Welcome'}
              </Text>
            </View>
          </View>

          {categories.map((category) => (
            <View key={category.label} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: drawerPalette.muted }]}>
                {category.label}
              </Text>
              <View style={styles.sectionItems}>
                {category.items.map((item) => {
                  const isActive =
                    props.state.routeNames[props.state.index] === item.target.name ||
                    props.state.routes[props.state.index]?.name === item.target.name;
                  const iconName = (Feather as any).glyphMap?.[item.icon]
                    ? (item.icon as keyof typeof Feather.glyphMap)
                    : (iconFallback as keyof typeof Feather.glyphMap);

                  return (
                    <Pressable
                      key={item.label}
                      onPress={() => {
                        if (item.target.type === 'tab') {
                          props.navigation.navigate('Tabs', { screen: item.target.name });
                        } else {
                          props.navigation.navigate(item.target.name as never);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.item,
                        isActive && {
                          backgroundColor: drawerPalette.itemActiveBg,
                          borderColor: drawerPalette.itemActiveBorder,
                          borderLeftColor: drawerPalette.accent
                        },
                        pressed && styles.itemPressed
                      ]}
                    >
                      <View style={styles.itemContent}>
                        <View style={styles.itemIcon}>
                          <Feather
                            name={iconName}
                            size={18}
                            color={isActive ? drawerPalette.accentSoft : drawerPalette.muted}
                          />
                        </View>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[
                            styles.itemText,
                            { color: isActive ? drawerPalette.text : drawerPalette.muted }
                          ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </DrawerContentScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default DrawerContent;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scroll: {
    paddingTop: 0,
    paddingBottom: 20
  },
  header: {
    paddingHorizontal: 10,
    paddingTop: 34,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 18
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.4
  },
  brandBlock: {
    flex: 1
  },
  brandSubtitle: {
    fontSize: 11,
    marginTop: 2
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 18
  },
  sectionItems: {
    gap: 8
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10
  },
  item: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    borderLeftWidth: 3,
    width: '100%',
    minHeight: 58
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  itemIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  itemPressed: {
    opacity: 0.7
  },
  itemText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: 'center'
  }
});
