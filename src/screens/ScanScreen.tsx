import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { addPurchaseItem, createPurchase } from '../db/repository';
import { extractUrlFromQrData, fetchNfceHtml, parseNfceHtml } from '../utils/nfce';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

type Stage = 'scanning' | 'processing' | 'error' | 'manual' | 'saving';

export default function ScanScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('scanning');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const handledRef = useRef(false);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setStage('processing');

    try {
      const url = extractUrlFromQrData(data);
      const html = await fetchNfceHtml(url);
      const parsed = parseNfceHtml(html);

      const purchaseId = await createPurchase(
        db,
        listId,
        parsed.purchaseDate,
        parsed.totalValue,
        'qr_parsed'
      );
      for (const item of parsed.items) {
        await addPurchaseItem(db, purchaseId, item.description, item.unitValue, item.quantity);
      }

      navigation.replace('HistoryDetail', { purchaseId });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao processar o cupom.');
      setStage('error');
    }
  };

  const handleManualSave = async () => {
    const total = parseFloat(manualTotal.replace(',', '.'));
    if (!Number.isFinite(total) || total <= 0) {
      setErrorMessage('Informe um valor válido maior que zero.');
      return;
    }
    setErrorMessage('');
    setStage('saving');
    const purchaseId = await createPurchase(
      db,
      listId,
      new Date().toISOString(),
      total,
      'manual_fallback'
    );
    navigation.replace('HistoryDetail', { purchaseId });
  };

  const retryScan = () => {
    handledRef.current = false;
    setErrorMessage('');
    setStage('scanning');
  };

  const goToManual = () => {
    setErrorMessage('');
    setStage('manual');
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>Precisamos da câmera para escanear o QR do cupom.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Permitir câmera</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === 'manual') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Informe o valor total</Text>
        <Text style={styles.message}>
          Não conseguimos ler o cupom automaticamente. Digite o valor total da compra.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={manualTotal}
          onChangeText={setManualTotal}
        />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={handleManualSave}>
          <Text style={styles.primaryButtonText}>Salvar compra</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === 'error') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Não foi possível ler o cupom</Text>
        <Text style={styles.message}>{errorMessage}</Text>
        <Pressable style={styles.primaryButton} onPress={retryScan}>
          <Text style={styles.primaryButtonText}>Tentar novamente</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={goToManual}>
          <Text style={styles.secondaryButtonText}>Informar valor manualmente</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === 'processing' || stage === 'saving') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>Processando cupom...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Aponte a câmera para o QR Code do cupom fiscal</Text>
        <Pressable style={styles.secondaryButton} onPress={goToManual}>
          <Text style={styles.secondaryButtonText}>Informar valor manualmente</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 16, color: '#374151', textAlign: 'center', marginBottom: 20 },
  errorText: { fontSize: 14, color: '#ef4444', textAlign: 'center', marginTop: -12, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 20,
    width: '100%',
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryButton: { marginTop: 14, padding: 10 },
  secondaryButtonText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  overlayText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});
