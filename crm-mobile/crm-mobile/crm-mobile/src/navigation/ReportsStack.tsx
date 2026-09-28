import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ReportsScreen from '../screens/ReportsScreen';
import SalesPerformanceReportScreen from '../screens/reports/SalesPerformanceReportScreen';
import SalesPerformanceDetailScreen from '../screens/reports/SalesPerformanceDetailScreen';
import LeadAgingReportScreen from '../screens/reports/LeadAgingReportScreen';
import ConversionReportScreen from '../screens/reports/ConversionReportScreen';

export type ReportsStackParamList = {
  ReportsHome: undefined;
  SalesPerformance: undefined;
  SalesPerformanceDetail: { userId: number; userName?: string; userEmail?: string };
  LeadAging: undefined;
  ConversionReport: undefined;
};

const Stack = createNativeStackNavigator<ReportsStackParamList>();

const ReportsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ReportsHome" component={ReportsScreen} />
    <Stack.Screen name="SalesPerformance" component={SalesPerformanceReportScreen} />
    <Stack.Screen name="SalesPerformanceDetail" component={SalesPerformanceDetailScreen} />
    <Stack.Screen name="LeadAging" component={LeadAgingReportScreen} />
    <Stack.Screen name="ConversionReport" component={ConversionReportScreen} />
  </Stack.Navigator>
);

export default ReportsStack;
