import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import LeadsStack from './LeadsStack';
import ChatScreen from '../screens/ChatScreen';
import NotesScreen from '../screens/NotesScreen';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../context/AuthContext';
import { ROLE_SALES } from '../config/constants';

export type AppTabParamList = {
  Dashboard: undefined;
  Leads: undefined;
  Chat: undefined;
  Notes: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

const AppTabs = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();
  const initialRoute = user?.roleId === ROLE_SALES ? 'Leads' : 'Dashboard';

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { display: 'none', height: 0 },
        tabBarLabelStyle: { display: 'none' },
        tabBarItemStyle: { height: 0 },
        tabBarButton: () => null,
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
            Dashboard: 'grid',
            Leads: 'users',
            Chat: 'message-circle',
            Notes: 'file-text'
          };
          const iconName = iconMap[route.name] || 'circle';
          return <Feather name={iconName} size={size - 2} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Dashboard" component={HomeScreen} />
      <Tab.Screen name="Leads" component={LeadsStack} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
    </Tab.Navigator>
  );
};

export default AppTabs;
