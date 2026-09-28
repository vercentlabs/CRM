import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OpportunitiesScreen from '../screens/OpportunitiesScreen';
import OpportunityFormScreen from '../screens/OpportunityFormScreen';
import OpportunityDetailsScreen from '../screens/OpportunityDetailsScreen';

export type OpportunitySummary = {
  id: number;
  lead_id: number;
  lead_name?: string | null;
  lead_email?: string | null;
  title: string;
  description?: string | null;
  value?: number | null;
  stage?: string | null;
  probability?: number | null;
  expected_close_date?: string | null;
  assigned_to?: number | null;
  assigned_to_name?: string | null;
  created_at?: string | null;
};

export type OpportunitiesStackParamList = {
  OpportunitiesHome: undefined;
  OpportunityForm: { mode: 'create' | 'edit'; opportunityId?: number };
  OpportunityDetails: { opportunity: OpportunitySummary };
};

const Stack = createNativeStackNavigator<OpportunitiesStackParamList>();

const OpportunitiesStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="OpportunitiesHome" component={OpportunitiesScreen} />
    <Stack.Screen name="OpportunityForm" component={OpportunityFormScreen} />
    <Stack.Screen name="OpportunityDetails" component={OpportunityDetailsScreen} />
  </Stack.Navigator>
);

export default OpportunitiesStack;
