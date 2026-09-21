import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { addPurchaseItem, createPurchase } from '../db/repository';
import { parseNfceHtml, stripScriptsAndStyles } from '../utils/nfce';
import { ThemeColors, useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NfceWebView'>;

// Grabs the page's current DOM and sends it back to React Native. Runs only
// when the user taps "Capturar dados", after they've gotten past whatever
// the Sefaz portal put in front of the receipt (Cloudflare challenge, the
// "Visualizar" button, etc.) — at that point the data is on-screen.
const CAPTURE_HTML_JS = `
  window.ReactNativeWebView.postMessage(document.documentElement.outerHTML);
  true;
`;

// Android WebView's default User-Agent carries a " wv" marker that some
// anti-bot systems (Cloudflare included) treat as a stronger bot signal
// than a plain mobile browser, even though the rendering engine is the
// same Chromium either way. Using a standard Chrome mobile UA avoids
// giving the challenge an easy extra reason to escalate.
const MOBILE_CHROME_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const CAPTURE_TIMEOUT_MS = 8000;

export default function NfceWebViewScreen({ route, navigation }: Props) {
  const { listId, url } = route.params;
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const webViewRef = useRef<WebView>(null);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugHtml, setDebugHtml] = useState<string | null>(null);

  const handleCapture = () => {
    setErrorMessage(null);
    setDebugHtml(null);
    setCapturing(true);
    webViewRef.current?.injectJavaScript(CAPTURE_HTML_JS);
    captureTimeoutRef.current = setTimeout(() => {
      setCapturing(false);
      setErrorMessage(
        'Não conseguimos capturar os dados da página. Verifique se os dados do cupom já apareceram na tela e tente de novo.'
      );
    }, CAPTURE_TIMEOUT_MS);
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
    const html = event.nativeEvent.data;
    try {
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setDebugHtml(stripScriptsAndStyles(html));
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível interpretar os dados do cupom nessa tela.'
      );
      setCapturing(false);
    }
  };

  const handleShareDebugHtml = async () => {
    if (!debugHtml) return;
    try {
      await Share.share({ message: debugHtml });
    } catch {
      // user dismissed the share sheet or it failed silently — nothing to recover here
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.instructionBar}>
        <Text style={styles.instructionText}>
          Resolva a verificação de segurança se aparecer e toque em "Visualizar" na página.
          Quando os dados do cupom aparecerem na tela, toque em "Capturar dados" abaixo.
        </Text>
      </View>

      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        userAgent={MOBILE_CHROME_USER_AGENT}
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        onMessage={handleMessage}
      />

      {errorMessage && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <View style={styles.errorButtonRow}>
            {debugHtml && (
              <Pressable
                style={styles.secondaryButton}
                onPress={handleShareDebugHtml}
                accessibilityRole="button"
                accessibilityLabel="Compartilhar dados técnicos para depuração"
              >
                <Text style={styles.secondaryButtonText}>Compartilhar dados técnicos</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
            >
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Pressable
        style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
        onPress={handleCapture}
        disabled={capturing}
        accessibilityRole="button"
        accessibilityLabel="Capturar dados do cupom"
        accessibilityState={{ disabled: capturing, busy: capturing }}
      >
        <Text style={styles.captureButtonText}>
          {capturing ? 'Capturando...' : 'Capturar dados do cupom'}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    instructionBar: {
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    instructionText: { fontSize: 13, color: colors.text },
    webview: { flex: 1, backgroundColor: colors.background },
    loadingOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    errorBar: {
      backgroundColor: colors.surfaceAlt,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      padding: 12,
    },
    errorText: { color: colors.danger, fontSize: 14, marginBottom: 8 },
    errorButtonRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    secondaryButton: { paddingVertical: 6, paddingHorizontal: 4 },
    secondaryButtonText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    captureButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    captureButtonDisabled: { opacity: 0.6 },
    captureButtonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  });
}
