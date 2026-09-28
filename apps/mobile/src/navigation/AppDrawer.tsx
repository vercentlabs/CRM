import { Feather } from '@expo/vector-icons';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { CommonActions } from '@react-navigation/native';
import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Badge, Text, useToast } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { AccountScreen } from '../modules/account/AccountScreen';
import { CalendarScreen } from '../modules/tasks/CalendarScreen';
import { CallsScreen } from '../modules/calls/CallsScreen';
import { useChatUnread } from '../modules/chat/hooks';
import { ChatScreen } from '../modules/chat/ChatScreen';
import { CustomersScreen } from '../modules/customers/CustomersScreen';
import { HomeScreen } from '../modules/dashboard/HomeScreen';
import { FollowupsScreen } from '../modules/followups/FollowupsScreen';
import { LeadsScreen } from '../modules/leads/LeadsScreen';
import { LocationsScreen } from '../modules/locations/LocationsScreen';
import { MessagesScreen } from '../modules/messages/MessagesScreen';
import { NotesScreen } from '../modules/notes/NotesScreen';
import { OpportunitiesScreen } from '../modules/opportunities/OpportunitiesScreen';
import { MembersScreen } from '../modules/organization/MembersScreen';
import { ReportsScreen } from '../modules/reports/ReportsScreen';
import { SettingsScreen } from '../modules/settings/SettingsScreen';
import { TasksScreen } from '../modules/tasks/TasksScreen';
import { useSession } from '../providers/SessionProvider';
import { useColors } from '../theme/ThemeProvider';
import { visibleMenu } from './menu';
import type { DrawerParamList } from './types';

const Drawer = createDrawerNavigator<DrawerParamList>();

const SCREENS: Record<keyof DrawerParamList, ComponentType> = {
  Home: HomeScreen,
  Leads: LeadsScreen,
  Followups: FollowupsScreen,
  Tasks: TasksScreen,
  Calendar: CalendarScreen,
  Customers: CustomersScreen,
  Opportunities: OpportunitiesScreen,
  Notes: NotesScreen,
  Calls: CallsScreen,
  Messages: MessagesScreen,
  Chat: ChatScreen,
  Reports: ReportsScreen,
  Locations: LocationsScreen,
  Members: MembersScreen,
  Settings: SettingsScreen,
  Account: AccountScreen,
};

/**
 * Top-level navigation. Only destinations the session's permissions allow are
 * registered, so they cannot be reached from the menu or by route name.
 * Visibility is UX: the API authorizes every request.
 */
export function AppDrawer() {
  const { canAny } = useSession();
  const c = useColors();
  const groups = useMemo(() => visibleMenu(canAny), [canAny]);
  const routes = groups.flatMap((g) => g.items.map((i) => i.route));
  return (
    <Drawer.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: c.surface, width: 300 },
        sceneStyle: { backgroundColor: c.bg },
      }}
      drawerContent={(props) => <DrawerContent {...props} />}
    >
      {routes.map((route) => (
        <Drawer.Screen key={route} name={route} component={SCREENS[route]} />
      ))}
    </Drawer.Navigator>
  );
}

function DrawerContent(props: DrawerContentComponentProps) {
  const { canAny, organization, organizations, user, membership, switchOrganization, logout } =
    useSession();
  const c = useColors();
  const toast = useToast();
  const unread = useChatUnread();
  const [switching, setSwitching] = useState<string | null>(null);
  const groups = useMemo(() => visibleMenu(canAny), [canAny]);
  const current = props.state.routeNames[props.state.index];
  const others = organizations.filter(
    (o) => o.status === 'active' && o.organization.id !== organization?.id,
  );

  const onSwitch = async (id: string, name: string) => {
    setSwitching(id);
    try {
      await switchOrganization(id);
      // A fresh stack for the new organization: nothing from the old one stays on screen.
      props.navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Home' }] }));
      toast.success(`Switched to ${name}`);
    } catch (error) {
      toast.error('Could not switch organization', errorMessage(error));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Avatar name={user?.name} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="label" numberOfLines={1}>
            {user?.name}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {membership?.role.name} · {organization?.name}
          </Text>
        </View>
      </View>

      {others.length > 0 ? (
        <View style={styles.group}>
          <Text variant="caption" color="muted" style={styles.groupLabel}>
            SWITCH ORGANIZATION
          </Text>
          {others.map((o) => (
            <Pressable
              key={o.organization.id}
              onPress={() => void onSwitch(o.organization.id, o.organization.name)}
              disabled={switching !== null}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${o.organization.name}`}
              accessibilityState={{ busy: switching === o.organization.id }}
              style={styles.item}
            >
              <Feather name="repeat" size={18} color={c.muted} />
              <Text style={{ flex: 1 }}>{o.organization.name}</Text>
              {switching === o.organization.id ? (
                <Text variant="caption" color="muted">
                  Switching…
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text
            variant="caption"
            color="muted"
            style={styles.groupLabel}
            accessibilityRole="header"
          >
            {group.label.toUpperCase()}
          </Text>
          {group.items.map((item) => {
            const active = current === item.route;
            return (
              <Pressable
                key={item.route}
                onPress={() => props.navigation.navigate(item.route)}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                style={[styles.item, active && { backgroundColor: c.primarySoft }]}
              >
                <Feather name={item.icon} size={18} color={active ? c.primary : c.muted} />
                <Text
                  style={{
                    flex: 1,
                    color: active ? c.primary : c.fg,
                    fontWeight: active ? '600' : '400',
                  }}
                >
                  {item.label}
                </Text>
                {item.route === 'Chat' && unread > 0 ? (
                  <Badge label={`${unread > 99 ? '99+' : unread} unread`} tone="danger" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <Pressable
        onPress={() => void logout()}
        accessibilityRole="button"
        style={[styles.item, { marginTop: 8 }]}
      >
        <Feather name="log-out" size={18} color={c.danger} />
        <Text color="danger">Sign out</Text>
      </Pressable>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  group: { paddingTop: 12, paddingHorizontal: 8 },
  groupLabel: { paddingHorizontal: 8, paddingBottom: 4, fontWeight: '600', letterSpacing: 0.5 },
  item: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
