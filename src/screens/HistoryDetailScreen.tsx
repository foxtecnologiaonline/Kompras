import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { Purchase, PurchaseItem, RootStackParamList } from '../types';
import { getPurchase, getPurchaseItems } from '../db/repository';
import { ThemeColors, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoryDetail'>;

export default function HistoryDetailScreen({ route }: Props) {
  const { purchaseId } = route.params;
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([
        getPurchase(db, purchaseId),
        getPurchaseItems(db, purchaseId),
      ]);
      setPurchase(p);
      setItems(i);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [db, purchaseId]);

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
        <Text style={styles.emptyText}>Não foi possível carregar esta compra.</Text>
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

  if (!purchase) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Esta compra não foi encontrada.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDate(purchase.purchase_date)}</Text>
        <Text style={styles.total}>{formatCurrency(purchase.total_value)}</Text>
        {purchase.raw_source === 'manual_fallback' && (
          <Text style={styles.note}>Valor informado manualmente (cupom não pôde ser lido)</Text>
        )}
        {purchase.receipt_photo_uri && (
          <Image
            source={{ uri: purchase.receipt_photo_uri }}
            style={styles.receiptPhoto}
            resizeMode="contain"
            accessibilityLabel="Foto do cupom fiscal"
          />
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhum item detalhado para esta compra.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Text style={styles.itemDescription}>{item.description}</Text>
            <Text style={styles.itemDetails}>
              {item.quantity} × {formatCurrency(item.unit_value)}
            </Text>
            <Text style={styles.itemTotal}>
              {formatCurrency(item.quantity * item.unit_value)}
            </Text>
          </View>
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
    header: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    date: { fontSize: 16, color: colors.textMuted },
    total: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 4 },
    note: { fontSize: 13, color: colors.warning, marginTop: 6 },
    receiptPhoto: {
      width: '100%',
      height: 220,
      borderRadius: 8,
      marginTop: 12,
      backgroundColor: colors.surfaceAlt,
    },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: 16, padding: 20, textAlign: 'center' },
    retryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
    },
    retryButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
    itemRow: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemDescription: { fontSize: 16, color: colors.text },
    itemDetails: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    itemTotal: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  });
}
