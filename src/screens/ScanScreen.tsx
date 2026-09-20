import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { addPurchaseItem, createPurchase } from '../db/repository';
import {
  extractUrlFromQrData,
  fetchNfceHtml,
  parseNfceHtml,
  stripScriptsAndStyles,
} from '../utils/nfce';
import { persistReceiptPhoto } from '../utils/receiptPhoto';
import { ThemeColors, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

type Stage = 'scanning' | 'processing' | 'error' | 'manual' | 'saving';

export default function ScanScreen({ route, navigation }: Props) {
  const { listId } = route.params;
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('scanning');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [debugHtml, setDebugHtml] = useState<string | null>(null);
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string | null>(null);
  const scanLockRef = useRef(false); // guards continuous live barcode scanning only
  const actionLockRef = useRef(false); // guards the single-tap "tirar foto" / "galeria" actions
  const cameraRef = useRef<CameraView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={12}
          style={styles.headerCloseButton}
        >
          <Text style={styles.headerCloseButtonText}>✕</Text>
        </Pressable>
      ),
    });
  }, [navigation, styles]);

  /** Shared pipeline: a decoded QR string -> fetch the NFC-e page -> parse -> save. */
  const processQrData = async (data: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let html: string | undefined;
    try {
      const url = extractUrlFromQrData(data);
      html = await fetchNfceHtml(url, controller.signal);
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

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace('HistoryDetail', { purchaseId });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao processar o cupom.');
      setDebugHtml(html ? stripScriptsAndStyles(html) : null);
      setStage('error');
    }
  };

  const handleCancelProcessing = () => {
    abortControllerRef.current?.abort();
    scanLockRef.current = false;
    setErrorMessage('');
    setDebugHtml(null);
    setStage('scanning');
  };

  const handleShareDebugHtml = async () => {
    if (!debugHtml) return;
    try {
      await Share.share({ message: debugHtml });
    } catch {
      // user dismissed the share sheet or it failed silently — nothing to recover here
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setDebugHtml(null);
    setStage('processing');
    await processQrData(data);
  };

  const handleTakePhoto = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setDebugHtml(null);
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
      await processQrData(results[0].data);
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
    setDebugHtml(null);
    try {
      // Kept at full quality: this copy is only used transiently to decode a
      // QR code, never persisted, and a sharper image scans more reliably.
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
      await processQrData(results[0].data);
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
      // Compressed (unlike the QR-decode pick above): this one gets copied
      // into permanent storage and re-rendered every time History opens.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
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
    try {
      const purchaseId = await createPurchase(
        db,
        listId,
        new Date().toISOString(),
        total,
        'manual_fallback',
        persistedPhotoUri
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace('HistoryDetail', { purchaseId });
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage('Não foi possível salvar a compra. Tente novamente.');
      setStage('manual');
    }
  };

  const retryScan = () => {
    scanLockRef.current = false;
    setErrorMessage('');
    setDebugHtml(null);
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
    const canAskAgain = permission.canAskAgain;
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>
          {canAskAgain
            ? 'Precisamos da câmera para escanear o QR do cupom.'
            : 'A permissão da câmera foi negada. Ative-a nos Ajustes do aparelho para escanear o cupom.'}
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={canAskAgain ? requestPermission : () => Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel={canAskAgain ? 'Permitir câmera' : 'Abrir ajustes do aparelho'}
        >
          <Text style={styles.primaryButtonText}>
            {canAskAgain ? 'Permitir câmera' : 'Abrir Ajustes'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={goToManual}
          accessibilityRole="button"
          accessibilityLabel="Informar valor manualmente"
        >
          <Text style={styles.secondaryButtonText}>Informar valor manualmente</Text>
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
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          value={manualTotal}
          onChangeText={setManualTotal}
          accessibilityLabel="Valor total da compra"
        />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {receiptPhotoUri ? (
          <View style={styles.photoPreviewRow}>
            <Image
              source={{ uri: receiptPhotoUri }}
              style={styles.photoPreview}
              resizeMode="contain"
              accessibilityLabel="Foto do cupom anexada"
            />
            <Pressable
              onPress={() => setReceiptPhotoUri(null)}
              accessibilityRole="button"
              accessibilityLabel="Remover foto"
            >
              <Text style={styles.secondaryButtonText}>Remover foto</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.attachPhotoRow}>
            <Pressable
              style={styles.attachPhotoButton}
              onPress={handleAttachPhotoFromCamera}
              accessibilityRole="button"
              accessibilityLabel="Fotografar cupom"
            >
              <Text style={styles.attachPhotoButtonText}>📷 Fotografar cupom</Text>
            </Pressable>
            <Pressable
              style={styles.attachPhotoButton}
              onPress={handleAttachPhotoFromGallery}
              accessibilityRole="button"
              accessibilityLabel="Escolher foto da galeria"
            >
              <Text style={styles.attachPhotoButtonText}>🖼️ Da galeria</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={styles.primaryButton}
          onPress={handleManualSave}
          accessibilityRole="button"
          accessibilityLabel="Salvar compra"
        >
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
        <Pressable
          style={styles.primaryButton}
          onPress={retryScan}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
        >
          <Text style={styles.primaryButtonText}>Tentar novamente</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={handlePickImage}
          accessibilityRole="button"
          accessibilityLabel="Escolher imagem da galeria"
        >
          <Text style={styles.secondaryButtonText}>Escolher imagem da galeria</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={goToManual}
          accessibilityRole="button"
          accessibilityLabel="Informar valor manualmente"
        >
          <Text style={styles.secondaryButtonText}>Informar valor manualmente</Text>
        </Pressable>
        {debugHtml && (
          <Pressable
            style={styles.secondaryButton}
            onPress={handleShareDebugHtml}
            accessibilityRole="button"
            accessibilityLabel="Compartilhar dados técnicos para depuração"
          >
            <Text style={styles.debugButtonText}>Compartilhar dados técnicos (depuração)</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (stage === 'processing' || stage === 'saving') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        <Text style={styles.message}>
          {stage === 'saving' ? 'Salvando compra...' : 'Processando cupom...'}
        </Text>
        {stage === 'processing' && (
          <Pressable
            style={styles.secondaryButton}
            onPress={handleCancelProcessing}
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
          >
            <Text style={styles.secondaryButtonText}>Cancelar</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Aponte a câmera para o QR Code do cupom fiscal</Text>
        <View style={styles.overlayButtonRow}>
          <Pressable
            style={styles.overlayButton}
            onPress={handleTakePhoto}
            accessibilityRole="button"
            accessibilityLabel="Tirar foto"
          >
            <Text style={styles.overlayButtonText}>Tirar foto</Text>
          </Pressable>
          <Pressable
            style={styles.overlayButton}
            onPress={handlePickImage}
            accessibilityRole="button"
            accessibilityLabel="Escolher da galeria"
          >
            <Text style={styles.overlayButtonText}>Escolher da galeria</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={goToManual}
          accessibilityRole="button"
          accessibilityLabel="Informar valor manualmente"
        >
          <Text style={styles.secondaryButtonTextLight}>Informar valor manualmente</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background,
    },
    headerCloseButton: { padding: 8, marginLeft: 4 },
    headerCloseButtonText: { color: colors.primary, fontSize: 20, fontWeight: '600' },
    spinner: { marginBottom: 4 },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center', color: colors.text },
    message: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
    errorText: { fontSize: 14, color: colors.danger, textAlign: 'center', marginTop: -12, marginBottom: 16 },
    attachPhotoRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    attachPhotoButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    attachPhotoButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    photoPreviewRow: { alignItems: 'center', marginBottom: 20 },
    photoPreview: {
      width: 160,
      height: 160,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: colors.surfaceAlt,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 20,
      width: '100%',
      textAlign: 'center',
      marginBottom: 20,
      color: colors.text,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
      width: '100%',
    },
    primaryButtonText: { color: colors.primaryText, fontSize: 17, fontWeight: '700' },
    secondaryButton: { marginTop: 14, padding: 10 },
    secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    secondaryButtonTextLight: { color: '#93c5fd', fontSize: 15, fontWeight: '600' },
    debugButtonText: { color: colors.textFaint, fontSize: 13, fontWeight: '500' },
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
}
