import { useCallback, useRef, useState } from 'react';
import {
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
import type { RootStackParamList, ShoppingListItem } from '../types';
import {
  addListItem,
  addListItems,
  deleteListItem,
  getListItems,
  setListItemChecked,
  updateListItemName,
  updateListItemQuantity,
} from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

export default function ListDetailScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const newItemInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    const rows = await getListItems(db, listId);
    setItems(rows);
  }, [db, listId]);

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
    const sanitized = text.replace(/[^0-9]/g, '');
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: sanitized === '' ? 0 : Number(sanitized) } : i))
    );
  };

  const handleQuantityCommit = async (item: ShoppingListItem) => {
    const quantity = item.quantity > 0 ? item.quantity : 1;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    await updateListItemQuantity(db, item.id, quantity);
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
        ListEmptyComponent={<Text style={styles.emptyText}>Adicione itens à sua lista.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Pressable style={styles.checkbox} onPress={() => handleToggle(item)}>
              <View style={[styles.checkboxBox, item.checked && styles.checkboxBoxChecked]}>
                {item.checked && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
            </Pressable>
            <TextInput
              style={[styles.itemInput, item.checked && styles.itemInputChecked]}
              value={item.name}
              onChangeText={(text) => handleRename(item, text)}
              onEndEditing={(e) => handleRenameCommit(item, e.nativeEvent.text)}
            />
            <TextInput
              style={[styles.quantityInput, item.checked && styles.itemInputChecked]}
              value={String(item.quantity)}
              onChangeText={(text) => handleQuantityChange(item, text)}
              onEndEditing={() => handleQuantityCommit(item)}
              keyboardType="number-pad"
              textAlign="center"
            />
            <Pressable onPress={() => handleDelete(item)} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>✕</Text>
            </Pressable>
          </View>
        )}
      />

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

      <View style={styles.reportRow}>
        <Pressable
          style={styles.reportButton}
          onPress={() => navigation.navigate('ListReport', { listId })}
        >
          <Text style={styles.reportButtonText}>Relatório da lista</Text>
        </Pressable>
        <Pressable
          style={styles.reportButton}
          onPress={() => navigation.navigate('ListVsReceipt', { listId })}
        >
          <Text style={styles.reportButtonText}>Lista x Cupom</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.closeButton}
        onPress={() => navigation.navigate('Scan', { listId })}
      >
        <Text style={styles.closeButtonText}>Fechar compra</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },
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
    width: 44,
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
  reportRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  reportButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reportButtonText: { color: '#2563eb', fontWeight: '600' },
  closeButton: {
    backgroundColor: '#16a34a',
    margin: 16,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
