import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UsersScreen from '../screens/UsersScreen';
import UserFormScreen from '../screens/UserFormScreen';

export type UsersStackParamList = {
  UsersHome: undefined;
  UserForm: { mode: 'create' | 'edit'; userId?: number };
};

const Stack = createNativeStackNavigator<UsersStackParamList>();

const UsersStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="UsersHome" component={UsersScreen} />
    <Stack.Screen name="UserForm" component={UserFormScreen} />
  </Stack.Navigator>
);

export default UsersStack;
