import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { PurchaseWithCount, RootStackParamList } from '../types';
import { getPurchases } from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export default function HistoryScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const [purchases, setPurchases] = useState<PurchaseWithCount[]>([]);

  const load = useCallback(async () => {
    const rows = await getPurchases(db);
    setPurchases(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={purchases}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={purchases.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma compra registrada ainda.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('HistoryDetail', { purchaseId: item.id })}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  date: { fontSize: 16, fontWeight: '600', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  total: { fontSize: 16, fontWeight: '700', color: '#16a34a' },
});
