import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LeadsScreen from '../screens/LeadsScreen';
import LeadDetailsScreen from '../screens/LeadDetailsScreen';
import LeadFormScreen from '../screens/LeadFormScreen';

export type LeadsStackParamList = {
  LeadsHome: undefined;
  LeadDetails: { leadId: number; autoCall?: boolean };
  LeadForm: { mode: 'create' | 'edit'; leadId?: number };
};

const Stack = createNativeStackNavigator<LeadsStackParamList>();

const LeadsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="LeadsHome" component={LeadsScreen} />
    <Stack.Screen name="LeadDetails" component={LeadDetailsScreen} />
    <Stack.Screen name="LeadForm" component={LeadFormScreen} />
  </Stack.Navigator>
);

export default LeadsStack;
