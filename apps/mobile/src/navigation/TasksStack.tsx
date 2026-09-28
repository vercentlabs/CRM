import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TasksScreen from '../screens/TasksScreen';
import TaskFormScreen from '../screens/TaskFormScreen';

export type TasksStackParamList = {
  TasksHome: undefined;
  TaskForm: { mode: 'create' | 'edit'; taskId?: number };
};

const Stack = createNativeStackNavigator<TasksStackParamList>();

const TasksStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="TasksHome" component={TasksScreen} />
    <Stack.Screen name="TaskForm" component={TaskFormScreen} />
  </Stack.Navigator>
);

export default TasksStack;
