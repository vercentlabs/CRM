import type { DrawerScreenProps } from '@react-navigation/drawer';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Top-level destinations (drawer). Which ones exist depends on permissions. */
export type DrawerParamList = {
  Home: undefined;
  Notifications: undefined;
  Leads: undefined;
  Followups: undefined;
  Tasks: undefined;
  Calendar: undefined;
  Customers: undefined;
  Opportunities: undefined;
  Notes: undefined;
  Calls: undefined;
  Messages: undefined;
  Chat: undefined;
  Reports: undefined;
  Locations: undefined;
  Members: undefined;
  Settings: undefined;
  Account: undefined;
};

/** Pushed screens (over the drawer) and the signed-out flow. */
export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string } | undefined;
  Main: NavigatorScreenParams<DrawerParamList> | undefined;
  LeadDetail: { id: number };
  LeadForm: { id?: number } | undefined;
  CustomerForm: { id?: number } | undefined;
  OpportunityForm: { id?: number; leadId?: number } | undefined;
  TaskForm: { id?: number; due?: string } | undefined;
  NoteForm: { id?: number } | undefined;
  ChatThread: { id: number; name: string };
  BulkMessage: undefined;
  Audit: undefined;
  AddMember: undefined;
};

export type RootScreenProps<K extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  K
>;
export type DrawerProps<K extends keyof DrawerParamList> = DrawerScreenProps<DrawerParamList, K>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
