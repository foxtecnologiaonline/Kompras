import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { PurchaseWithCount, RootStackParamList } from '../types';
import { getPurchases } from '../db/repository';
import { ThemeColors, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export default function HistoryScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [purchases, setPurchases] = useState<PurchaseWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getPurchases(db);
      setPurchases(rows);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Não foi possível carregar o histórico.</Text>
        <Pressable
          style={styles.retryButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar novamente"
        >
          <Text style={styles.retryButtonText}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={purchases}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={purchases.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🧾</Text>
            <Text style={styles.emptyText}>Nenhuma compra registrada ainda.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('HistoryDetail', { purchaseId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`Compra de ${formatDate(item.purchase_date)}, ${formatCurrency(item.total_value)}`}
          >
            <View>
              <Text style={styles.date}>{formatDate(item.purchase_date)}</Text>
              <Text style={styles.subtitle}>
                {item.item_count} {item.item_count === 1 ? 'item' : 'itens'}
                {item.raw_source === 'manual_fallback' ? ' · valor manual' : ''}
              </Text>
            </View>
            <Text style={styles.total}>{formatCurrency(item.total_value)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 24,
      gap: 16,
    },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyState: { alignItems: 'center', gap: 8 },
    emptyStateIcon: { fontSize: 48, marginBottom: 4 },
    emptyText: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },
    retryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
    },
    retryButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    date: { fontSize: 16, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
    total: { fontSize: 16, fontWeight: '700', color: colors.success },
  });
}
