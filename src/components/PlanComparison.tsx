import { StyleSheet, Text, View } from 'react-native';
import type { CheckedSummary } from '../utils/comparison';

interface Props {
  summary: CheckedSummary;
}

/** "Planejado × comprado" block shown on a purchase that came from a list. */
export default function PlanComparison({ summary }: Props) {
  const { planned, checked, missing } = summary;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Planejado × comprado</Text>
      <Text style={styles.headline}>
        {planned} planejado{planned === 1 ? '' : 's'} · {checked} marcado{checked === 1 ? '' : 's'}{' '}
        como pego · {missing.length} faltou{missing.length === 1 ? '' : 'ram'}
      </Text>

      {missing.length === 0 ? (
        <Text style={styles.allDone}>✓ Tudo o que você planejou foi marcado como pego.</Text>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✗ Ficou de fora</Text>
          {missing.map((item) => (
            <Text key={item.id} style={styles.row}>
              {item.name}
              {item.quantity > 1 ? ` (${item.quantity})` : ''}
            </Text>
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
  allDone: { fontSize: 14, color: '#16a34a', marginTop: 10, fontWeight: '600' },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#b91c1c', marginBottom: 4 },
  row: { fontSize: 15, color: '#374151', paddingVertical: 2 },
});
