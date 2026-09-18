import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { PurchaseItem, RootStackParamList, ShoppingListItem } from '../types';
import { getListItems, getPurchaseItemsForList } from '../db/repository';
import { namesMatch } from '../utils/matching';

type Props = NativeStackScreenProps<RootStackParamList, 'ListVsReceipt'>;

type Row =
  | { kind: 'matched'; listItem: ShoppingListItem; receiptItems: PurchaseItem[] }
  | { kind: 'missing'; listItem: ShoppingListItem }
  | { kind: 'extra'; receiptItem: PurchaseItem };

export default function ListVsReceiptScreen({ route }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);
  const [receiptItems, setReceiptItems] = useState<PurchaseItem[]>([]);

  const load = useCallback(async () => {
    const [items, receipts] = await Promise.all([
      getListItems(db, listId),
      getPurchaseItemsForList(db, listId),
    ]);
    setListItems(items);
    setReceiptItems(receipts);
  }, [db, listId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rows = useMemo<Row[]>(() => {
    const usedReceiptIds = new Set<number>();
    const matchedRows: Row[] = listItems.map((listItem) => {
      const matches = receiptItems.filter(
        (ri) => !usedReceiptIds.has(ri.id) && namesMatch(ri.description, listItem.name)
      );
      matches.forEach((m) => usedReceiptIds.add(m.id));
      if (matches.length === 0) {
        return { kind: 'missing', listItem };
      }
      return { kind: 'matched', listItem, receiptItems: matches };
    });
    const extraRows: Row[] = receiptItems
      .filter((ri) => !usedReceiptIds.has(ri.id))
      .map((receiptItem) => ({ kind: 'extra', receiptItem }));
    return [...matchedRows, ...extraRows];
  }, [listItems, receiptItems]);

  const boughtCount = rows.filter((r) => r.kind === 'matched').length;
  const missingCount = rows.filter((r) => r.kind === 'missing').length;
  const extraCount = rows.filter((r) => r.kind === 'extra').length;

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <SummaryStat label="Da lista" value={`${boughtCount}`} sublabel="comprados" color="#16a34a" />
        <SummaryStat label="Da lista" value={`${missingCount}`} sublabel="não comprados" color="#ef4444" />
        <SummaryStat label="Fora da lista" value={`${extraCount}`} sublabel="no cupom" color="#d97706" />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row, index) =>
          row.kind === 'extra' ? `extra-${row.receiptItem.id}` : `list-${row.listItem.id}-${index}`
        }
        contentContainerStyle={rows.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Sem itens de lista ou de cupom para comparar.</Text>
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'matched') {
            const boughtQty = row.receiptItems.reduce((sum, r) => sum + r.quantity, 0);
            return (
              <View style={[styles.row, styles.rowMatched]}>
                <Text style={styles.rowIcon}>✓</Text>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>{row.listItem.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    Planejado: {row.listItem.quantity} · Comprado: {boughtQty} (
                    {row.receiptItems.map((r) => r.description).join(', ')})
                  </Text>
                </View>
              </View>
            );
          }
          if (row.kind === 'missing') {
            return (
              <View style={[styles.row, styles.rowMissing]}>
                <Text style={styles.rowIcon}>✕</Text>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>{row.listItem.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    Planejado: {row.listItem.quantity} · Não encontrado no cupom
                  </Text>
                </View>
              </View>
            );
          }
          return (
            <View style={[styles.row, styles.rowExtra]}>
              <Text style={styles.rowIcon}>＋</Text>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>{row.receiptItem.description}</Text>
                <Text style={styles.rowSubtitle}>
                  Comprado: {row.receiptItem.quantity} · Não estava na lista
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function SummaryStat({
  label,
  sublabel,
  value,
  color,
}: {
  label: string;
  sublabel: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statLabel}>{sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#6b7280' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16, textAlign: 'center', paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowMatched: { backgroundColor: '#f0fdf4' },
  rowMissing: { backgroundColor: '#fef2f2' },
  rowExtra: { backgroundColor: '#fffbeb' },
  rowIcon: { fontSize: 16, marginRight: 10, marginTop: 2 },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: 16, color: '#111827', fontWeight: '600' },
  rowSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
