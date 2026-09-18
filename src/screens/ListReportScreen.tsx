import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { RootStackParamList, ShoppingListItem } from '../types';
import { getListItems } from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'ListReport'>;

export default function ListReportScreen({ route }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const [items, setItems] = useState<ShoppingListItem[]>([]);

  const load = useCallback(async () => {
    setItems(await getListItems(db, listId));
  }, [db, listId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const bought = items.filter((i) => i.checked);
  const notBought = items.filter((i) => !i.checked);
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const boughtQty = bought.reduce((sum, i) => sum + i.quantity, 0);

  const sections: Array<{ title: string; data: ShoppingListItem[] }> = [
    { title: `Comprados (${bought.length})`, data: bought },
    { title: `Não comprados (${notBought.length})`, data: notBought },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <SummaryStat label="Itens" value={`${items.length}`} />
        <SummaryStat label="Comprados" value={`${bought.length}`} />
        <SummaryStat label="Não comprados" value={`${notBought.length}`} />
        <SummaryStat label="Qtd. planejada" value={`${totalQty}`} />
        <SummaryStat label="Qtd. comprada" value={`${boughtQty}`} />
      </View>

      <FlatList
        data={sections}
        keyExtractor={(section) => section.title}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={<Text style={styles.emptyText}>Esta lista não tem itens.</Text>}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.length === 0 ? (
              <Text style={styles.sectionEmptyText}>Nenhum item.</Text>
            ) : (
              section.data.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={[styles.itemName, item.checked && styles.itemNameBought]}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemQty}>{item.quantity}x</Text>
                </View>
              ))
            )}
          </View>
        )}
      />
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 16,
  },
  stat: { minWidth: 72 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  sectionEmptyText: {
    color: '#9ca3af',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemName: { fontSize: 16, color: '#111827', flex: 1, marginRight: 8 },
  itemNameBought: { color: '#16a34a' },
  itemQty: { fontSize: 14, color: '#6b7280' },
});
