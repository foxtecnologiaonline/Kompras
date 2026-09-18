import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import type { RootStackParamList, ShoppingList } from '../types';
import {
  createShoppingList,
  deleteShoppingList,
  getShoppingLists,
  updateShoppingListName,
} from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'Lists'>;

export default function ListsScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingList, setEditingList] = useState<ShoppingList | null>(null);

  const load = useCallback(async () => {
    const rows = await getShoppingLists(db);
    setLists(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCreateModal = () => {
    setEditingList(null);
    setNameInput('');
    setNameModalVisible(true);
  };

  const openRenameModal = (list: ShoppingList) => {
    setEditingList(list);
    setNameInput(list.name ?? '');
    setNameModalVisible(true);
  };

  const closeNameModal = () => {
    setNameModalVisible(false);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (editingList) {
      await updateShoppingListName(db, editingList.id, trimmed || null);
      setNameModalVisible(false);
      await load();
    } else {
      const id = await createShoppingList(db, trimmed || null);
      setNameModalVisible(false);
      await load();
      navigation.navigate('ListDetail', { listId: id });
    }
  };

  const handleDelete = (list: ShoppingList) => {
    Alert.alert(
      'Excluir lista',
      `Excluir "${listDisplayName(list)}"? Os itens dela serão perdidos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteShoppingList(db, list.id);
            await load();
          },
        },
      ]
    );
  };

  const handleLongPress = (list: ShoppingList) => {
    Alert.alert(listDisplayName(list), undefined, [
      { text: 'Renomear', onPress: () => openRenameModal(list) },
      { text: 'Excluir', style: 'destructive', onPress: () => handleDelete(list) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.historyButton} onPress={() => navigation.navigate('History')}>
          <Text style={styles.historyButtonText}>Histórico</Text>
        </Pressable>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={lists.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhuma lista ainda. Crie a sua primeira!</Text>
        }
        ListHeaderComponent={
          lists.length > 0 ? (
            <Text style={styles.hint}>Toque e segure uma lista para renomear ou excluir</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.listRow}
            onPress={() => navigation.navigate('ListDetail', { listId: item.id })}
            onLongPress={() => handleLongPress(item)}
          >
            <Text style={styles.listTitle}>{listDisplayName(item)}</Text>
            {item.name && (
              <Text style={styles.listSubtitle}>Criada em {formatDate(item.created_at)}</Text>
            )}
          </Pressable>
        )}
      />

      <Pressable style={styles.createButton} onPress={openCreateModal}>
        <Text style={styles.createButtonText}>+ Nova lista</Text>
      </Pressable>

      <Modal visible={nameModalVisible} transparent animationType="fade" onRequestClose={closeNameModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingList ? 'Renomear lista' : 'Nome da lista'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Lista mensal"
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              onSubmitEditing={handleSaveName}
              returnKeyType="done"
            />
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancelButton} onPress={closeNameModal}>
                <Text style={styles.modalCancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalSaveButton} onPress={handleSaveName}>
                <Text style={styles.modalSaveButtonText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function listDisplayName(list: ShoppingList): string {
  return list.name?.trim() || `Lista de ${formatDate(list.created_at)}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16 },
  historyButton: { padding: 8 },
  historyButtonText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 16 },
  hint: {
    color: '#9ca3af',
    fontSize: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  listRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  listTitle: { fontSize: 17, color: '#111827' },
  listSubtitle: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  createButton: {
    backgroundColor: '#2563eb',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  createButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  modalCancelButton: { paddingVertical: 10, paddingHorizontal: 12 },
  modalCancelButtonText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
  modalSaveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  modalSaveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
