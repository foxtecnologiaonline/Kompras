import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  FlatList,
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
import type { RootStackParamList, ShoppingListItem } from '../types';
import {
  addListItem,
  addListItems,
  deleteListItem,
  getListItems,
  getShoppingList,
  setListItemChecked,
  updateListItemName,
  updateListItemQuantity,
} from '../db/repository';
import SwipeableRow from '../components/SwipeableRow';
import { animateNextLayout } from '../utils/animateNextLayout';
import { ThemeColors, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

type FocusedEdit = { itemId: number; field: 'name' | 'quantity' };

export default function ListDetailScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const newItemInputRef = useRef<TextInput>(null);
  // While a name/quantity field is focused, a reload triggered by some other
  // action (checking a different item, etc.) must not clobber the in-progress
  // keystrokes with the last-committed DB value for that same field.
  const focusedEditRef = useRef<FocusedEdit | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, list] = await Promise.all([
        getListItems(db, listId),
        getShoppingList(db, listId),
      ]);
      setItems((prev) => {
        const focus = focusedEditRef.current;
        if (!focus) return rows;
        const prevItem = prev.find((i) => i.id === focus.itemId);
        if (!prevItem) return rows;
        return rows.map((row) => {
          if (row.id !== focus.itemId) return row;
          return focus.field === 'name'
            ? { ...row, name: prevItem.name }
            : { ...row, quantity: prevItem.quantity };
        });
      });
      if (list) {
        const title =
          list.name?.trim() || `Lista de ${new Date(list.created_at).toLocaleDateString('pt-BR')}`;
        navigation.setOptions({ title });
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
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
    animateNextLayout();
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
      animateNextLayout();
      await addListItems(db, listId, names);
      await load();
    }
    newItemInputRef.current?.focus();
  };

  const handleToggle = async (item: ShoppingListItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setListItemChecked(db, item.id, !item.checked);
    await load();
  };

  const handleRename = (item: ShoppingListItem, name: string) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, name } : i)));
  };

  const handleNameFocus = (item: ShoppingListItem) => {
    focusedEditRef.current = { itemId: item.id, field: 'name' };
  };

  const handleRenameCommit = async (item: ShoppingListItem, name: string) => {
    focusedEditRef.current = null;
    const trimmed = name.trim();
    if (!trimmed || trimmed === item.name) return;
    await updateListItemName(db, item.id, trimmed);
  };

  const handleQuantityFocus = (item: ShoppingListItem) => {
    focusedEditRef.current = { itemId: item.id, field: 'quantity' };
  };

  const handleQuantityChange = (item: ShoppingListItem, text: string) => {
    const sanitized = text.replace(/[^0-9]/g, '');
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: sanitized === '' ? 0 : Number(sanitized) } : i))
    );
  };

  const handleQuantityCommit = async (item: ShoppingListItem) => {
    focusedEditRef.current = null;
    const quantity = item.quantity > 0 ? item.quantity : 1;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    await updateListItemQuantity(db, item.id, quantity);
  };

  const handleDelete = async (item: ShoppingListItem) => {
    animateNextLayout();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await deleteListItem(db, item.id);
    await load();
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
        <Text style={styles.emptyText}>Não foi possível carregar esta lista.</Text>
        <Pressable
          style={styles.retryButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar novamente"
        >
          <Text style={styles.retryButtonText}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }

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
        ListHeaderComponent={
          items.length > 0 ? <Text style={styles.hint}>Deslize um item para excluí-lo</Text> : null
        }
        renderItem={({ item }) => (
          <SwipeableRow
            actions={[
              {
                label: 'Excluir',
                color: colors.danger,
                accessibilityLabel: `Excluir ${item.name}`,
                onPress: () => handleDelete(item),
              },
            ]}
          >
            <View style={styles.itemRow}>
              <Pressable
                style={styles.checkbox}
                onPress={() => handleToggle(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked }}
                accessibilityLabel={`Marcar ${item.name} como ${item.checked ? 'não pego' : 'pego'}`}
              >
                <View style={[styles.checkboxBox, item.checked && styles.checkboxBoxChecked]}>
                  {item.checked && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
              </Pressable>
              <TextInput
                style={[styles.itemInput, item.checked && styles.itemInputChecked]}
                value={item.name}
                onChangeText={(text) => handleRename(item, text)}
                onFocus={() => handleNameFocus(item)}
                onEndEditing={(e) => handleRenameCommit(item, e.nativeEvent.text)}
                accessibilityLabel={`Nome do item: ${item.name}`}
              />
              <TextInput
                style={[styles.quantityInput, item.checked && styles.itemInputChecked]}
                value={String(item.quantity)}
                onChangeText={(text) => handleQuantityChange(item, text)}
                onFocus={() => handleQuantityFocus(item)}
                onEndEditing={() => handleQuantityCommit(item)}
                keyboardType="number-pad"
                textAlign="center"
                accessibilityLabel={`Quantidade de ${item.name}`}
              />
            </View>
          </SwipeableRow>
        )}
      />

      <View style={styles.addRow}>
        <TextInput
          ref={newItemInputRef}
          style={styles.addInput}
          placeholder="Novo item (cole uma lista para adicionar vários)"
          placeholderTextColor={colors.textFaint}
          value={newItemName}
          onChangeText={handleNewItemChangeText}
          multiline
          blurOnSubmit={false}
          accessibilityLabel="Novo item"
        />
        <Pressable
          style={styles.addButton}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Adicionar item"
        >
          <Text style={styles.addButtonText}>Adicionar</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.closeButton}
        onPress={() => navigation.navigate('Scan', { listId })}
        accessibilityRole="button"
        accessibilityLabel="Fechar compra"
      >
        <Text style={styles.closeButtonText}>Fechar compra</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
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
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },
    hint: {
      color: colors.textFaint,
      fontSize: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    checkbox: { padding: 4 },
    checkboxBox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.textFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxBoxChecked: { backgroundColor: colors.success, borderColor: colors.success },
    checkboxMark: { color: colors.successText, fontWeight: '700' },
    itemInput: { flex: 1, fontSize: 16, marginLeft: 10, color: colors.text },
    itemInputChecked: { color: colors.textFaint, textDecorationLine: 'line-through' },
    quantityInput: {
      width: 44,
      marginLeft: 8,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingVertical: 4,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    addInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      maxHeight: 120,
      color: colors.text,
    },
    addButton: {
      marginLeft: 8,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    addButtonText: { color: colors.primaryText, fontWeight: '700' },
    closeButton: {
      backgroundColor: colors.success,
      margin: 16,
      marginTop: 4,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    closeButtonText: { color: colors.successText, fontSize: 17, fontWeight: '700' },
    retryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
    },
    retryButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  });
}
