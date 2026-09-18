import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import type { RootStackParamList, ShoppingList } from '../types';
import { createShoppingList, deleteShoppingList, getShoppingLists } from '../db/repository';

type Props = NativeStackScreenProps<RootStackParamList, 'Lists'>;

export default function ListsScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const [lists, setLists] = useState<ShoppingList[]>([]);

  const load = useCallback(async () => {
    const rows = await getShoppingLists(db);
    setLists(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCreate = async () => {
    const id = await createShoppingList(db);
    await load();
    navigation.navigate('ListDetail', { listId: id });
  };

  const handleDelete = (list: ShoppingList) => {
    Alert.alert(
      'Excluir lista',
      `Excluir a lista de ${formatDate(list.created_at)}? Os itens dela serão perdidos.`,
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
            <Text style={styles.hint}>Toque e segure uma lista para excluí-la</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.listRow}
            onPress={() => navigation.navigate('ListDetail', { listId: item.id })}
            onLongPress={() => handleDelete(item)}
          >
            <Text style={styles.listTitle}>Lista de {formatDate(item.created_at)}</Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.createButton} onPress={handleCreate}>
        <Text style={styles.createButtonText}>+ Nova lista</Text>
      </Pressable>
    </View>
  );
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
  createButton: {
    backgroundColor: '#2563eb',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  createButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
