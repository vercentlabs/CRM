import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Button, ErrorState, LoadingState, Text } from '../components/ui';
import {
  ForgotPasswordScreen,
  LoginScreen,
  ResetPasswordScreen,
} from '../modules/auth/AuthScreens';
import { ChatThreadScreen } from '../modules/chat/ChatThreadScreen';
import { CustomerFormScreen } from '../modules/customers/CustomerFormScreen';
import { LeadDetailScreen } from '../modules/leads/LeadDetailScreen';
import { LeadFormScreen } from '../modules/leads/LeadFormScreen';
import { BulkMessageScreen } from '../modules/messages/BulkMessageScreen';
import { NoteFormScreen } from '../modules/notes/NoteFormScreen';
import { OpportunityFormScreen } from '../modules/opportunities/OpportunityFormScreen';
import { AddMemberScreen } from '../modules/organization/MembersScreen';
import { AuditScreen } from '../modules/settings/AuditScreen';
import { TaskFormScreen } from '../modules/tasks/TaskFormScreen';
import { useSession } from '../providers/SessionProvider';
import { useColors } from '../theme/ThemeProvider';
import { AppDrawer } from './AppDrawer';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Auth-state routing: starting → signed out → signed in (→ no access / error).
 * Protected screens are not registered until the session is restored, so
 * nothing from the CRM can flash or be deep-linked before that.
 */
export function RootNavigator() {
  const { status, organization, logout, retry } = useSession();
  const c = useColors();

  if (status === 'starting') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <LoadingState label="Restoring your session…" />
      </View>
    );
  }
  if (status === 'no-access') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text variant="heading" style={styles.text}>
          Your access to this organization is not active
        </Text>
        <Text color="muted" style={styles.text}>
          The membership may have been suspended or removed. Contact your administrator.
        </Text>
        <Button label="Sign out" variant="primary" onPress={() => void logout()} />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ErrorState error={new Error('offline')} />
        <Text color="muted" style={styles.text}>
          We could not reach the server to restore your session.
        </Text>
        <Button label="Try again" variant="primary" icon="refresh-cw" onPress={retry} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {status === 'signed-in' ? (
        // Keyed by organization: switching organization resets every signed-in screen.
        <Stack.Group navigationKey={organization?.id ?? 'none'}>
          <Stack.Screen name="Main" component={AppDrawer} />
          <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
          <Stack.Screen name="LeadForm" component={LeadFormScreen} />
          <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
          <Stack.Screen name="OpportunityForm" component={OpportunityFormScreen} />
          <Stack.Screen name="TaskForm" component={TaskFormScreen} />
          <Stack.Screen name="NoteForm" component={NoteFormScreen} />
          <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
          <Stack.Screen name="BulkMessage" component={BulkMessageScreen} />
          <Stack.Screen name="Audit" component={AuditScreen} />
          <Stack.Screen name="AddMember" component={AddMemberScreen} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  text: { textAlign: 'center' },
});
