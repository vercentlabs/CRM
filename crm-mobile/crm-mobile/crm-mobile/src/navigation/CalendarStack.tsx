import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CalendarScreen from '../screens/CalendarScreen';
import CalendarEventFormScreen from '../screens/CalendarEventFormScreen';

export type CalendarStackParamList = {
  CalendarHome: undefined;
  CalendarEventForm: undefined;
};

const Stack = createNativeStackNavigator<CalendarStackParamList>();

const CalendarStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="CalendarHome" component={CalendarScreen} />
    <Stack.Screen name="CalendarEventForm" component={CalendarEventFormScreen} />
  </Stack.Navigator>
);

export default CalendarStack;
