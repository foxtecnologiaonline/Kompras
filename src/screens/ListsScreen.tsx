import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import * as Haptics from 'expo-haptics';
import type { RootStackParamList, ShoppingList } from '../types';
import {
  createShoppingList,
  deleteShoppingList,
  getShoppingLists,
  updateShoppingListName,
} from '../db/repository';
import SwipeableRow from '../components/SwipeableRow';
import { animateNextLayout } from '../utils/animateNextLayout';
import { ThemeColors, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Lists'>;

export default function ListsScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingList, setEditingList] = useState<ShoppingList | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getShoppingLists(db);
      setLists(rows);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
            animateNextLayout();
            await deleteShoppingList(db, list.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Não foi possível carregar suas listas.</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar novamente"
        >
          <Text style={styles.primaryButtonText}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.historyButton}
          onPress={() => navigation.navigate('History')}
          accessibilityRole="button"
          accessibilityLabel="Ver histórico de compras"
        >
          <Text style={styles.historyButtonText}>Histórico</Text>
        </Pressable>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={lists.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🛒</Text>
            <Text style={styles.emptyText}>Nenhuma lista ainda.</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={openCreateModal}
              accessibilityRole="button"
              accessibilityLabel="Criar minha primeira lista"
            >
              <Text style={styles.primaryButtonText}>Criar minha primeira lista</Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={
          lists.length > 0 ? (
            <Text style={styles.hint}>Toque e segure, ou deslize, para renomear ou excluir</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <SwipeableRow
            actions={[
              {
                label: 'Excluir',
                color: colors.danger,
                accessibilityLabel: `Excluir ${listDisplayName(item)}`,
                onPress: () => handleDelete(item),
              },
            ]}
          >
            <Pressable
              style={styles.listRow}
              onPress={() => navigation.navigate('ListDetail', { listId: item.id })}
              onLongPress={() => handleLongPress(item)}
              accessibilityRole="button"
              accessibilityLabel={listDisplayName(item)}
              accessibilityHint="Toque para abrir. Toque e segure para renomear ou excluir."
            >
              <Text style={styles.listTitle}>{listDisplayName(item)}</Text>
              {item.name && (
                <Text style={styles.listSubtitle}>Criada em {formatDate(item.created_at)}</Text>
              )}
            </Pressable>
          </SwipeableRow>
        )}
      />

      <Pressable
        style={styles.createButton}
        onPress={openCreateModal}
        accessibilityRole="button"
        accessibilityLabel="Nova lista"
      >
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
              placeholderTextColor={colors.textFaint}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              onSubmitEditing={handleSaveName}
              returnKeyType="done"
            />
            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={closeNameModal}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
              >
                <Text style={styles.modalCancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.modalSaveButton}
                onPress={handleSaveName}
                accessibilityRole="button"
                accessibilityLabel="Salvar"
              >
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 24,
      gap: 16,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16 },
    historyButton: { padding: 8 },
    historyButtonText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyState: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
    emptyStateIcon: { fontSize: 48, marginBottom: 4 },
    emptyText: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },
    hint: {
      color: colors.textFaint,
      fontSize: 12,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    listRow: {
      backgroundColor: colors.background,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    listTitle: { fontSize: 17, color: colors.text },
    listSubtitle: { fontSize: 13, color: colors.textFaint, marginTop: 2 },
    createButton: {
      backgroundColor: colors.primary,
      margin: 16,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    createButtonText: { color: colors.primaryText, fontSize: 17, fontWeight: '700' },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    modalButtonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 16,
      gap: 12,
    },
    modalCancelButton: { paddingVertical: 10, paddingHorizontal: 12 },
    modalCancelButtonText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
    modalSaveButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 18,
    },
    modalSaveButtonText: { color: colors.primaryText, fontSize: 15, fontWeight: '700' },
  });
}
