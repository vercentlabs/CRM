import React, { useMemo, useState } from 'react';
import { View, Pressable, Text, StyleSheet, Modal, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import type { DrawerParamList } from '../navigation/AppDrawer';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';

type AppTopbarProps = {
  placeholder?: string;
};

const AppTopbar = ({ placeholder: _placeholder = 'Search leads, customers, tasks...' }: AppTopbarProps) => {
  const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>();
  const { user, logout } = useAuth();
  const { theme, resolvedMode, toggleMode } = useTheme();
  const { colors } = theme;
  const initial = (user?.name || user?.email || 'U').charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);

  const roleLabel = useMemo(() => {
    switch (user?.roleId) {
      case ROLE_ADMIN:
        return 'System Administrator';
      case ROLE_MANAGER:
        return 'Manager';
      case ROLE_SALES:
        return 'Sales';
      default:
        return 'Team Member';
    }
  }, [user?.roleId]);

  return (
    <View style={[styles.topbar, { backgroundColor: colors.appTopbar, borderBottomColor: colors.border }]}>
      <Pressable
        style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      >
        <Feather name="menu" size={18} color={colors.foreground} />
      </Pressable>
      <View style={styles.spacer} />
      <Pressable style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="bell" size={18} color={colors.foreground} />
      </Pressable>
      <Pressable
        style={[styles.profileButton, { backgroundColor: colors.brand }]}
        onPress={() => setMenuOpen(true)}
      >
        <Text style={styles.profileInitial}>{initial}</Text>
      </Pressable>

      <Modal
        transparent
        visible={menuOpen}
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border }
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.menuLabel, { color: colors.mutedForeground }]}>Signed in as</Text>
            <Text style={[styles.menuRole, { color: colors.foreground }]}>{roleLabel}</Text>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('Profile');
              }}
            >
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Profile</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('ChangePassword');
              }}
            >
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Change Password</Text>
            </Pressable>
            <View style={styles.menuSwitchRow}>
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Dark Theme</Text>
              <Switch
                value={resolvedMode === 'dark'}
                onValueChange={toggleMode}
                trackColor={{ false: '#cbd5f5', true: '#7c3aed' }}
                thumbColor={resolvedMode === 'dark' ? '#ffffff' : '#ffffff'}
              />
            </View>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                void logout();
              }}
            >
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>Logout</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default AppTopbar;

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    marginTop: 12,
    marginBottom: 12
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileInitial: {
    color: '#ffffff',
    fontWeight: '600'
  },
  spacer: {
    flex: 1
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start'
  },
  menuCard: {
    alignSelf: 'flex-end',
    marginTop: 72,
    marginRight: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minWidth: 200
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '600'
  },
  menuRole: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4
  },
  menuDivider: {
    height: 1,
    marginVertical: 10
  },
  menuItem: {
    paddingVertical: 8
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '600'
  },
  menuSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6
  }
});
