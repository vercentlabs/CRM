import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Card, Chip } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import type { OpportunitiesStackParamList } from '../navigation/OpportunitiesStack';
import { useAuth } from '../context/AuthContext';

const OpportunityDetailsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<OpportunitiesStackParamList>>();
  const route = useRoute<RouteProp<OpportunitiesStackParamList, 'OpportunityDetails'>>();
  const { opportunity } = route.params;
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isSales, isManagerOrHigher } = useAuth();

  const canEdit = useMemo(() => {
    if (isManagerOrHigher()) return true;
    if (!isSales() || !user?.id) return false;
    return opportunity.assigned_to === user.id;
  }, [isManagerOrHigher, isSales, user?.id, opportunity.assigned_to]);

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return `INR ${Number(value).toLocaleString('en-IN')}`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const day = parsed.getDate();
    const month = parsed.toLocaleString('en-GB', { month: 'short' });
    const year = parsed.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const stageLabel = opportunity.stage || 'Prospecting';

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Opportunity Details
          </Text>
          {canEdit ? (
            <Pressable
              style={styles.editButton}
              onPress={() =>
                navigation.navigate('OpportunityForm', {
                  mode: 'edit',
                  opportunityId: opportunity.id
                })
              }
            >
              <Feather name="edit-3" size={16} color={colors.brand} />
              <Text style={[styles.editButtonText, { color: colors.brand }]}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.editSpacer} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.card}>
            <View style={styles.detailBlock}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Title</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {opportunity.title}
              </Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                Description
              </Text>
              <Text style={[styles.bodyText, { color: colors.foreground }]}>
                {opportunity.description || '-'}
              </Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Stage</Text>
              <Chip label={stageLabel} />
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Opportunity Info</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Value</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {formatCurrency(opportunity.value)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Probability</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {opportunity.probability !== null && opportunity.probability !== undefined
                  ? `${opportunity.probability}%`
                  : '-'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Expected Close</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {formatDate(opportunity.expected_close_date)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Owner</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {opportunity.assigned_to_name || 'Unassigned'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Created</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {formatDate(opportunity.created_at)}
              </Text>
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Lead</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Lead Name</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {opportunity.lead_name || '-'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Lead Email</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {opportunity.lead_email || '-'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Lead ID</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {opportunity.lead_id}
              </Text>
            </View>
          </Card>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default OpportunityDetailsScreen;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1
    },
    safeArea: {
      flex: 1
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center'
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600'
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border
    },
    editButtonText: {
      fontSize: 12,
      fontWeight: '600'
    },
    editSpacer: {
      width: 60
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      gap: 16
    },
    card: {
      gap: 12
    },
    title: {
      fontSize: 16,
      fontWeight: '700'
    },
    bodyText: {
      fontSize: 12,
      lineHeight: 18
    },
    detailBlock: {
      gap: 6
    },
    detailLabel: {
      fontSize: 11,
      fontWeight: '600'
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600'
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    infoLabel: {
      fontSize: 11,
      fontWeight: '600'
    },
    infoValue: {
      fontSize: 12,
      fontWeight: '600'
    }
  });
