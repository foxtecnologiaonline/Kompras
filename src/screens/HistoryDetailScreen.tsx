import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { Purchase, PurchaseItem, RootStackParamList } from '../types';
import { getPurchase, getPurchaseItems } from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoryDetail'>;

export default function HistoryDetailScreen({ route }: Props) {
  const { purchaseId } = route.params;
  const db = useSQLiteContext();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);

  const load = useCallback(async () => {
    const [p, i] = await Promise.all([
      getPurchase(db, purchaseId),
      getPurchaseItems(db, purchaseId),
    ]);
    setPurchase(p);
    setItems(i);
  }, [db, purchaseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!purchase) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDate(purchase.purchase_date)}</Text>
        <Text style={styles.total}>{formatCurrency(purchase.total_value)}</Text>
        {purchase.raw_source === 'manual_fallback' && (
          <Text style={styles.note}>Valor informado manualmente (cupom não pôde ser lido)</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  date: { fontSize: 16, color: '#6b7280' },
  total: { fontSize: 28, fontWeight: '700', color: '#111827', marginTop: 4 },
  note: { fontSize: 13, color: '#b45309', marginTop: 6 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16, padding: 20, textAlign: 'center' },
  itemRow: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemDescription: { fontSize: 16, color: '#111827' },
  itemDetails: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 2 },
});
