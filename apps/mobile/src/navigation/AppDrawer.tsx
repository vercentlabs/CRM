import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import AppTabs from './AppTabs';
import DrawerContent from './DrawerContent';
import CustomersStack from './CustomersStack';
import OpportunitiesStack from './OpportunitiesStack';
import TasksStack from './TasksStack';
import FollowupsScreen from '../screens/FollowupsScreen';
import OverdueFollowupsScreen from '../screens/OverdueFollowupsScreen';
import CalendarStack from './CalendarStack';
import ReportsStack from './ReportsStack';
import SettingsScreen from '../screens/SettingsScreen';
import UsersStack from './UsersStack';
import AdminScreen from '../screens/AdminScreen';
import CallsScreen from '../screens/CallsScreen';
import AuditLogsScreen from '../screens/AuditLogsScreen';
import LocationsScreen from '../screens/LocationsScreen';
import LeadMessagesScreen from '../screens/LeadMessagesScreen';
import BulkMessagesScreen from '../screens/BulkMessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import AIAgentScreen from '../screens/AIAgentScreen';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '../config/constants';

export type DrawerParamList = {
  Tabs: undefined;
  AIAgent: undefined;
  Customers: undefined;
  Opportunities: undefined;
  Tasks: undefined;
  Followups: undefined;
  OverdueFollowups: undefined;
  Calendar: undefined;
  Calls: undefined;
  LeadMessages: undefined;
  BulkMessages: undefined;
  Reports: undefined;
  AuditLogs: undefined;
  Locations: undefined;
  Settings: undefined;
  Users: undefined;
  Admin: undefined;
  Profile: undefined;
  ChangePassword: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

const AppDrawer = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();
  const initialRoute = user?.roleId === ROLE_ADMIN ? 'Admin' : 'Tabs';
  const roleId = user?.roleId ?? null;
  const hasRole = (roles?: number[]) =>
    !roles || roles.length === 0 || (roleId ? roles.includes(roleId) : false);

  type DrawerScreenDef = {
    name: keyof DrawerParamList;
    component: React.ComponentType<object>;
    roles?: readonly number[];
  };

  const screens: DrawerScreenDef[] = [
    { name: 'Tabs', component: AppTabs, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'AIAgent', component: AIAgentScreen, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'Customers', component: CustomersStack, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'Opportunities', component: OpportunitiesStack, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'Tasks', component: TasksStack, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'Followups', component: FollowupsScreen, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'OverdueFollowups', component: OverdueFollowupsScreen, roles: [ROLE_ADMIN, ROLE_MANAGER] },
    { name: 'Calendar', component: CalendarStack, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'Calls', component: CallsScreen, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'LeadMessages', component: LeadMessagesScreen, roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES] },
    { name: 'BulkMessages', component: BulkMessagesScreen, roles: [ROLE_ADMIN, ROLE_MANAGER] },
    { name: 'Reports', component: ReportsStack, roles: [ROLE_ADMIN, ROLE_MANAGER] },
    { name: 'AuditLogs', component: AuditLogsScreen, roles: [ROLE_ADMIN] },
    { name: 'Locations', component: LocationsScreen, roles: [ROLE_ADMIN, ROLE_MANAGER] },
    { name: 'Settings', component: SettingsScreen, roles: [ROLE_ADMIN] },
    { name: 'Users', component: UsersStack, roles: [ROLE_ADMIN] },
    { name: 'Admin', component: AdminScreen, roles: [ROLE_ADMIN] },
    { name: 'Profile', component: ProfileScreen },
    { name: 'ChangePassword', component: ChangePasswordScreen }
  ];

  return (
    <Drawer.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: colors.appSidebar,
          width: 280
        },
        // React Navigation 7 renamed sceneContainerStyle → sceneStyle (the old key was ignored)
        sceneStyle: {
          backgroundColor: colors.appShell
        }
      }}
      drawerContent={(props) => <DrawerContent {...props} />}
    >
      {screens
        .filter((screen) => hasRole(screen.roles ? [...screen.roles] : undefined))
        .map((screen) => (
          <Drawer.Screen
            key={screen.name}
            name={screen.name}
            component={screen.component}
            options={
              screen.name === 'Profile' || screen.name === 'ChangePassword'
                ? { drawerItemStyle: { display: 'none' }, title: '' }
                : undefined
            }
          />
        ))}
    </Drawer.Navigator>
  );
};

export default AppDrawer;
