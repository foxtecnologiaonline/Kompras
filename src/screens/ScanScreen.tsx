import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { createPurchase } from '../db/repository';
import { extractUrlFromQrData } from '../utils/nfce';
import { persistReceiptPhoto } from '../utils/receiptPhoto';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

type Stage = 'scanning' | 'processing' | 'error' | 'manual' | 'saving';

export default function ScanScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('scanning');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string | null>(null);
  const scanLockRef = useRef(false); // guards continuous live barcode scanning only
  const actionLockRef = useRef(false); // guards the single-tap "tirar foto" / "galeria" actions
  const cameraRef = useRef<CameraView>(null);

  // Coming back to this screen (e.g. "Voltar" from the NFC-e WebView after
  // it couldn't read the page) should let a live scan try again right away,
  // not stay silently stuck from the lock the previous attempt set.
  useEffect(() => {
    if (isFocused) {
      scanLockRef.current = false;
    }
  }, [isFocused]);

  /**
   * A decoded QR string only ever contains the consulta URL — the Sefaz-MG
   * portal gates the actual receipt data behind a Cloudflare challenge, so
   * a plain fetch() can never see it. Hand the URL to a WebView screen
   * where the challenge renders for real (and the user can solve it like
   * in a normal browser) before we try to read the result.
   */
  const openNfceWebView = (data: string) => {
    try {
      const url = extractUrlFromQrData(data);
      navigation.navigate('NfceWebView', { listId, url });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'QR Code inválido.');
      setStage('error');
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    openNfceWebView(data);
  };

  const handleTakePhoto = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      setStage('processing');
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
      if (!photo) throw new Error('Não foi possível capturar a foto.');
      const results = await scanFromURLAsync(photo.uri, ['qr']);
      if (results.length === 0) {
        setErrorMessage('Não encontramos nenhum QR Code nessa foto. Tente aproximar mais.');
        setStage('error');
        return;
      }
      openNfceWebView(results[0].data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao processar a foto.');
      setStage('error');
    } finally {
      actionLockRef.current = false;
    }
  };

  const handlePickImage = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      setStage('processing');
      const results = await scanFromURLAsync(result.assets[0].uri, ['qr']);
      if (results.length === 0) {
        setErrorMessage('Não encontramos nenhum QR Code nessa imagem.');
        setStage('error');
        return;
      }
      openNfceWebView(results[0].data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao processar a imagem.');
      setStage('error');
    } finally {
      actionLockRef.current = false;
    }
  };

  const handleAttachPhotoFromCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (result.canceled || result.assets.length === 0) return;
      setReceiptPhotoUri(result.assets[0].uri);
    } catch {
      // camera unavailable or permission denied — user just stays without a photo attached
    }
  };

  const handleAttachPhotoFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;
      setReceiptPhotoUri(result.assets[0].uri);
    } catch {
      // gallery unavailable or permission denied — user just stays without a photo attached
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
    let persistedPhotoUri: string | null = null;
    if (receiptPhotoUri) {
      try {
        persistedPhotoUri = await persistReceiptPhoto(receiptPhotoUri);
      } catch {
        // couldn't persist the photo — still save the purchase with the total the user typed
      }
    }
    const purchaseId = await createPurchase(
      db,
      listId,
      new Date().toISOString(),
      total,
      'manual_fallback',
      persistedPhotoUri
    );
    navigation.replace('HistoryDetail', { purchaseId });
  };

  const retryScan = () => {
    scanLockRef.current = false;
    setErrorMessage('');
    setStage('scanning');
  };

  const goToManual = () => {
    setErrorMessage('');
    setReceiptPhotoUri(null);
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
      <KeyboardAvoidingView
        style={styles.centerContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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

        {receiptPhotoUri ? (
          <View style={styles.photoPreviewRow}>
            <Image
              source={{ uri: receiptPhotoUri }}
              style={styles.photoPreview}
              resizeMode="contain"
            />
            <Pressable onPress={() => setReceiptPhotoUri(null)}>
              <Text style={styles.secondaryButtonText}>Remover foto</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.attachPhotoRow}>
            <Pressable style={styles.attachPhotoButton} onPress={handleAttachPhotoFromCamera}>
              <Text style={styles.attachPhotoButtonText}>📷 Fotografar cupom</Text>
            </Pressable>
            <Pressable style={styles.attachPhotoButton} onPress={handleAttachPhotoFromGallery}>
              <Text style={styles.attachPhotoButtonText}>🖼️ Da galeria</Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.primaryButton} onPress={handleManualSave}>
          <Text style={styles.primaryButtonText}>Salvar compra</Text>
        </Pressable>
      </KeyboardAvoidingView>
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
        <Pressable style={styles.secondaryButton} onPress={handlePickImage}>
          <Text style={styles.secondaryButtonText}>Escolher imagem da galeria</Text>
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
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        active={isFocused}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Aponte a câmera para o QR Code do cupom fiscal</Text>
        <View style={styles.overlayButtonRow}>
          <Pressable style={styles.overlayButton} onPress={handleTakePhoto}>
            <Text style={styles.overlayButtonText}>Tirar foto</Text>
          </Pressable>
          <Pressable style={styles.overlayButton} onPress={handlePickImage}>
            <Text style={styles.overlayButtonText}>Escolher da galeria</Text>
          </Pressable>
        </View>
        <Pressable style={styles.secondaryButton} onPress={goToManual}>
          <Text style={styles.secondaryButtonTextLight}>Informar valor manualmente</Text>
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
  attachPhotoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  attachPhotoButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  attachPhotoButtonText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  photoPreviewRow: { alignItems: 'center', marginBottom: 20 },
  photoPreview: {
    width: 160,
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f3f4f6',
  },
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
  secondaryButtonTextLight: { color: '#93c5fd', fontSize: 15, fontWeight: '600' },
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
  overlayButtonRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  overlayButton: {
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  overlayButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
