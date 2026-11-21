import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PurchaseItem } from '../types';
import type { Comparison, PlannedRow } from '../utils/comparison';
import { formatCurrency, formatQuantity } from '../utils/format';

interface Props {
  comparison: Comparison;
  /** Only used in 'linked' mode: tapping an item lets the user fix its link. */
  onPressMatched?: (row: PlannedRow) => void;
  onPressMissing?: (row: PlannedRow) => void;
  onPressOutside?: (item: PurchaseItem) => void;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Planejado × comprado" block shown on a purchase that came from a list. */
export default function PlanComparison({ comparison, onPressMatched, onPressMissing, onPressOutside }: Props) {
  const { mode, planned, matched, missing, outside, outsideTotal, outsidePct } = comparison;
  const linked = mode === 'linked';

  const headline = linked
    ? `${planned} ${plural(planned, 'planejado', 'planejados')} · ${matched.length} ${plural(matched.length, 'comprado', 'comprados')} · ${missing.length} ${plural(missing.length, 'ficou', 'ficaram')} de fora`
    : `${planned} ${plural(planned, 'planejado', 'planejados')} · ${matched.length} ${plural(matched.length, 'marcado', 'marcados')} como pego · ${missing.length} ${plural(missing.length, 'faltou', 'faltaram')}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Planejado × comprado</Text>
      <Text style={styles.headline}>{headline}</Text>

      {linked && outside.length > 0 && (
        <Text style={styles.outsideSummary}>
          Fora da lista: {outside.length} {plural(outside.length, 'item', 'itens')} ·{' '}
          {formatCurrency(outsideTotal)}
          {outsidePct !== null ? ` (${Math.round(outsidePct)}% do valor dos itens)` : ''}
        </Text>
      )}

      {linked && matched.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.okTitle]}>✓ Comprado</Text>
          {matched.map((row) => (
            <Pressable key={row.item.id} style={styles.row} onPress={() => onPressMatched?.(row)}>
              <Text style={styles.rowTitle}>
                {row.item.name} <Text style={styles.arrow}>→</Text> {row.bought?.description}
              </Text>
              <Text style={styles.rowDetail}>
                {row.bought ? `${formatQuantity(row.bought.quantity)} × ${formatCurrency(row.bought.unit_value)}` : ''}
                {row.bought?.list_item_link_source === 'auto' ? ' · sugestão automática' : ''}
              </Text>
              {row.boughtLess && row.bought && (
                <Text style={styles.warn}>
                  ⚠ planejado {formatQuantity(row.item.quantity)}, comprado {formatQuantity(row.bought.quantity)}
                </Text>
              )}
            </Pressable>
          ))}
          <Text style={styles.hint}>Toque num item para corrigir o vínculo.</Text>
        </View>
      )}

      {missing.length === 0 ? (
        <Text style={styles.allDone}>
          {linked ? '✓ Tudo o que você planejou está no cupom.' : '✓ Tudo o que você planejou foi marcado como pego.'}
        </Text>
      ) : (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.missingTitle]}>✗ Ficou de fora</Text>
          {missing.map((row) => (
            <Pressable
              key={row.item.id}
              style={styles.row}
              disabled={!linked}
              onPress={() => onPressMissing?.(row)}
            >
              <Text style={styles.rowTitle}>
                {row.item.name}
                {row.item.quantity > 1 ? ` (${formatQuantity(row.item.quantity)})` : ''}
              </Text>
              {linked && row.item.checked && (
                <Text style={styles.rowDetail}>
                  Marcado como pego, mas não está no cupom — toque para vincular
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {linked && outside.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.outsideTitle]}>+ Fora da lista</Text>
          {outside.map((item) => (
            <Pressable key={item.id} style={styles.row} onPress={() => onPressOutside?.(item)}>
              <Text style={styles.rowTitle}>{item.description}</Text>
              <Text style={styles.rowDetail}>
                {formatQuantity(item.quantity)} × {formatCurrency(item.unit_value)} · toque para vincular
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  title: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
  headline: { fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 6 },
  outsideSummary: { fontSize: 14, color: '#b45309', marginTop: 6, fontWeight: '600' },
  allDone: { fontSize: 14, color: '#16a34a', marginTop: 10, fontWeight: '600' },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  okTitle: { color: '#16a34a' },
  missingTitle: { color: '#b91c1c' },
  outsideTitle: { color: '#b45309' },
  row: { paddingVertical: 6 },
  rowTitle: { fontSize: 15, color: '#111827' },
  arrow: { color: '#9ca3af' },
  rowDetail: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  warn: { fontSize: 12, color: '#b45309', marginTop: 1, fontWeight: '600' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
