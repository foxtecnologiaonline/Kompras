import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export interface LinkPickerOption {
  key: string;
  label: string;
  detail?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: LinkPickerOption[];
  onPick: (key: string) => void;
  /** Present only when the tapped item is already linked. */
  onUnlink?: () => void;
  onClose: () => void;
}

/** Small modal to choose what to link a planned/coupon item to. */
export default function LinkPicker({ visible, title, options, onPick, onUnlink, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <FlatList
            data={options}
            keyExtractor={(o) => o.key}
            style={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>Nenhum item disponível para vincular.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.option} onPress={() => onPick(item.key)}>
                <Text style={styles.optionLabel}>{item.label}</Text>
                {item.detail ? <Text style={styles.optionDetail}>{item.detail}</Text> : null}
              </Pressable>
            )}
          />

          <View style={styles.buttonRow}>
            {onUnlink ? (
              <Pressable style={styles.button} onPress={onUnlink}>
                <Text style={styles.unlinkText}>Desvincular</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable style={styles.button} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '75%' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  list: { flexGrow: 0 },
  empty: { color: '#6b7280', fontSize: 14, paddingVertical: 12 },
  option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  optionLabel: { fontSize: 16, color: '#111827' },
  optionDetail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  button: { paddingVertical: 8, paddingHorizontal: 4 },
  unlinkText: { color: '#b91c1c', fontSize: 15, fontWeight: '600' },
  cancelText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
});
