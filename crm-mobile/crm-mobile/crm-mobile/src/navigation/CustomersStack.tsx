import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CustomersScreen from '../screens/CustomersScreen';
import CustomerFormScreen from '../screens/CustomerFormScreen';

export type CustomersStackParamList = {
  CustomersHome: undefined;
  CustomerForm: { mode: 'create' };
};

const Stack = createNativeStackNavigator<CustomersStackParamList>();

const CustomersStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="CustomersHome" component={CustomersScreen} />
    <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
  </Stack.Navigator>
);

export default CustomersStack;
