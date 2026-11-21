import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { deletePurchase } from '../db/repository';
import type { Purchase } from '../types';
import { formatCurrency, formatDate } from './format';
import { discardReceiptAttachment } from './receiptPhoto';

/** Asks for confirmation, then deletes the purchase, its items and its attachment. */
export function confirmAndDeletePurchase(
  db: SQLiteDatabase,
  purchase: Pick<Purchase, 'id' | 'purchase_date' | 'total_value'>,
  onDeleted: () => void
): void {
  Alert.alert(
    'Excluir compra',
    `Excluir a compra de ${formatDate(purchase.purchase_date)} (${formatCurrency(purchase.total_value)})? Os itens do cupom e o anexo serão apagados. Se a lista dela não tiver outra compra, ela será reaberta.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const receiptUri = await deletePurchase(db, purchase.id);
            if (receiptUri) discardReceiptAttachment(receiptUri);
            onDeleted();
          } catch {
            Alert.alert('Não foi possível excluir a compra', 'Tente novamente.');
          }
        },
      },
    ]
  );
}
