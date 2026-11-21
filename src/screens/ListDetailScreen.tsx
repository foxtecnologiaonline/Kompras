import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { RootStackParamList, ShoppingList, ShoppingListItem } from '../types';
import { formatQuantity } from '../utils/format';
import { parseQuantityInput, sanitizeQuantityInput } from '../utils/quantity';
import {
  addListItem,
  addListItems,
  deleteListItem,
  getLatestPurchaseIdForList,
  getListItems,
  getShoppingList,
  reopenShoppingList,
  setListItemChecked,
  updateListItemName,
  updateListItemQuantity,
} from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

export default function ListDetailScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [list, setList] = useState<ShoppingList | null>(null);
  // What the user is typing in each quantity field. Kept as text while editing
  // because "1," is not a number yet; committed (parsed) when editing ends.
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({});
  const [newItemName, setNewItemName] = useState('');
  // A closed list is a record of what was planned for a purchase; editing it
  // afterwards would silently rewrite that plan. Reopening unlocks it.
  const isClosed = !!list?.closed_at;
  const newItemInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    const [rows, loadedList] = await Promise.all([
      getListItems(db, listId),
      getShoppingList(db, listId),
    ]);
    setItems(rows);
    setList(loadedList);
    if (loadedList) {
      const title =
        loadedList.name?.trim() ||
        `Lista de ${new Date(loadedList.created_at).toLocaleDateString('pt-BR')}`;
      navigation.setOptions({ title });
    }
  }, [db, listId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name) return;
    await addListItem(db, listId, name);
    setNewItemName('');
    await load();
    newItemInputRef.current?.focus();
  };

  /**
   * A newline in the field means either Enter after typing one item, or a
   * multi-line list pasted in. Either way: every non-empty line becomes an
   * item, added in one shot, and the keyboard stays open for the next one.
   */
  const handleNewItemChangeText = async (text: string) => {
    if (!text.includes('\n')) {
      setNewItemName(text);
      return;
    }
    const names = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setNewItemName('');
    if (names.length > 0) {
      await addListItems(db, listId, names);
      await load();
    }
    newItemInputRef.current?.focus();
  };

  const handleToggle = async (item: ShoppingListItem) => {
    if (isClosed) return;
    await setListItemChecked(db, item.id, !item.checked);
    await load();
  };

  const handleRename = (item: ShoppingListItem, name: string) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, name } : i)));
  };

  const handleRenameCommit = async (item: ShoppingListItem, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === item.name) return;
    await updateListItemName(db, item.id, trimmed);
  };

  const handleQuantityChange = (item: ShoppingListItem, text: string) => {
    setQuantityDrafts((prev) => ({ ...prev, [item.id]: sanitizeQuantityInput(text) }));
  };

  const handleQuantityCommit = async (item: ShoppingListItem) => {
    const draft = quantityDrafts[item.id];
    if (draft === undefined) return;
    setQuantityDrafts((prev) => {
      const { [item.id]: _discarded, ...rest } = prev;
      return rest;
    });
    // An empty or zero entry restores the previous quantity instead of saving nonsense.
    const quantity = parseQuantityInput(draft) ?? item.quantity;
    if (quantity === item.quantity) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    await updateListItemQuantity(db, item.id, quantity);
  };

  const handleViewPurchase = async () => {
    const purchaseId = await getLatestPurchaseIdForList(db, listId);
    if (purchaseId === null) {
      Alert.alert('Compra não encontrada', 'Reabra a lista para registrar a compra de novo.');
      return;
    }
    navigation.navigate('HistoryDetail', { purchaseId });
  };

  const handleReopen = () => {
    Alert.alert(
      'Reabrir lista',
      'A compra já registrada continua no histórico. Reabrir permite fechar esta lista de novo e pode gerar uma segunda compra.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reabrir',
          onPress: async () => {
            await reopenShoppingList(db, listId);
            await load();
          },
        },
      ]
    );
  };

  const handleDelete = async (item: ShoppingListItem) => {
    await deleteListItem(db, item.id);
    await load();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        ListHeaderComponent={
          isClosed ? (
            <Text style={styles.closedBanner}>
              Lista fechada — somente leitura. Reabra a lista para editar.
            </Text>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.emptyText}>Adicione itens à sua lista.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Pressable style={styles.checkbox} onPress={() => handleToggle(item)} disabled={isClosed}>
              <View style={[styles.checkboxBox, item.checked && styles.checkboxBoxChecked]}>
                {item.checked && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
            </Pressable>
            <TextInput
              style={[styles.itemInput, item.checked && styles.itemInputChecked]}
              value={item.name}
              editable={!isClosed}
              onChangeText={(text) => handleRename(item, text)}
              onEndEditing={(e) => handleRenameCommit(item, e.nativeEvent.text)}
            />
            <TextInput
              style={[styles.quantityInput, item.checked && styles.itemInputChecked]}
              value={quantityDrafts[item.id] ?? formatQuantity(item.quantity)}
              onChangeText={(text) => handleQuantityChange(item, text)}
              onEndEditing={() => handleQuantityCommit(item)}
              keyboardType="decimal-pad"
              textAlign="center"
              editable={!isClosed}
            />
            {!isClosed && (
              <Pressable onPress={() => handleDelete(item)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
        )}
      />

      {!isClosed && (
        <View style={styles.addRow}>
          <TextInput
            ref={newItemInputRef}
            style={styles.addInput}
            placeholder="Novo item (cole uma lista para adicionar vários)"
            value={newItemName}
            onChangeText={handleNewItemChangeText}
            multiline
            blurOnSubmit={false}
          />
          <Pressable style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>Adicionar</Text>
          </Pressable>
        </View>
      )}

      {isClosed ? (
        <>
          <Pressable style={styles.viewPurchaseButton} onPress={handleViewPurchase}>
            <Text style={styles.closeButtonText}>Compra fechada — ver no histórico</Text>
          </Pressable>
          <Pressable style={styles.reopenButton} onPress={handleReopen}>
            <Text style={styles.reopenButtonText}>Reabrir lista</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={styles.closeButton}
          onPress={() => navigation.navigate('Scan', { listId })}
        >
          <Text style={styles.closeButtonText}>Fechar compra</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },
  closedBanner: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  checkbox: { padding: 4 },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxMark: { color: '#fff', fontWeight: '700' },
  itemInput: { flex: 1, fontSize: 16, marginLeft: 10, color: '#111827' },
  itemInputChecked: { color: '#9ca3af', textDecorationLine: 'line-through' },
  quantityInput: {
    width: 64,
    marginLeft: 8,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingVertical: 4,
  },
  deleteButton: { padding: 8, marginLeft: 4 },
  deleteButtonText: { color: '#ef4444', fontSize: 16 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 120,
  },
  addButton: {
    marginLeft: 8,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  closeButton: {
    backgroundColor: '#16a34a',
    margin: 16,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  viewPurchaseButton: {
    backgroundColor: '#2563eb',
    margin: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  reopenButton: { alignItems: 'center', paddingVertical: 10, marginBottom: 8 },
  reopenButtonText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
});
