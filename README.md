# Kompras — Fase 0 (Dogfooding)

App mínimo de lista de compras para validar a dor pessoal do fundador antes de decidir lançamento/modelo de negócio. Uso individual, local, mobile, sem backend.

## Stack

- React Native + Expo (SDK 57)
- SQLite local via `expo-sqlite`
- Leitura de QR Code via `expo-camera`
- `fetch` client-side para o portal público de NFC-e (Sefaz-MG)
- Sem autenticação, sem backend

## Rodando o projeto

```bash
npm install
npm start
```

Abra no dispositivo com o app Expo Go (Android/iOS) ou em um emulador.

## Build de teste automático (APK via EAS Build)

Todo push nas branches `main` ou `claude/**` dispara um build automático de um APK Android instalável, via GitHub Actions + EAS Build. Não precisa de máquina local nem de Expo Go — é um instalador de verdade.

**Configuração única (uma vez só):**

1. Crie uma conta gratuita em [expo.dev](https://expo.dev).
2. Gere um access token em [expo.dev/accounts/[sua-conta]/settings/access-tokens](https://expo.dev/accounts/settings/access-tokens).
3. No GitHub, vá em **Settings → Secrets and variables → Actions** deste repositório e crie um secret chamado `EXPO_TOKEN` com o valor do token.

**Depois disso:**

- Qualquer push nas branches monitoradas dispara o workflow `.github/workflows/eas-build.yml` automaticamente.
- Também dá pra disparar manualmente em **Actions → EAS Build (Android preview APK) → Run workflow**.
- O build roda na nuvem da Expo (leva alguns minutos). O link de download do APK aparece no painel [expo.dev](https://expo.dev) (projeto `kompras`, aba Builds) e nos logs do job do GitHub Actions.
- Instale o APK direto no celular Android (é preciso permitir "instalar de fontes desconhecidas" na primeira vez).

**Se o job falhar avisando que EXPO_TOKEN não está configurado:** siga os passos 1–3 acima.

**Se sua conta Expo tiver acesso a múltiplas organizações/contas:** o `eas init` automático vai pedir para escolher uma explicitamente. Nesse caso, edite `.github/workflows/eas-build.yml` e adicione `--account <nome-da-conta>` ao comando `eas init`.

**Tamanho do APK:** o profile `preview` do `eas.json` restringe o build a `arm64-v8a` (a arquitetura de praticamente todo celular Android vendido nos últimos ~8-9 anos; `armeabi-v7a`/`x86`/`x86_64` não são incluídos) e liga minificação (R8) + shrink de recursos no `app.json` via `expo-build-properties`. Se o APK não instalar num aparelho específico por incompatibilidade de arquitetura (raro, só em aparelhos muito antigos/32-bit), volte a incluir `armeabi-v7a` na lista em `eas.json`.

Uma parte do tamanho é inerente à funcionalidade de escanear o QR do cupom: o `expo-camera` inclui o ML Kit Barcode Scanning do Google (~10-20MB), que é necessário para a leitura de QR Code funcionar — não é código não utilizado, é o único ponto que ainda pesa de forma significativa depois de todas as otimizações acima.

## Funcionalidades (Fase 0)

1. **Lista de compras** — criar, editar e excluir itens (nome livre); persiste localmente.
2. **Modo compra** — marcar itens como "pego" na tela da lista.
3. **Fechamento de compra** — escanear o QR Code do cupom fiscal (NFC-e), extrair itens e valor total automaticamente via parse do HTML do portal Sefaz-MG; se o parse falhar, permite informar o valor total manualmente.
4. **Histórico** — lista de compras fechadas, com detalhe de itens e valores.

## Estrutura

```
src/
  db/            # schema SQLite e funções de acesso a dados
  navigation/    # stack de navegação
  screens/       # telas do app
  types/         # tipos compartilhados
  utils/nfce.ts  # extração da URL do QR e parse do HTML da NFC-e
```

## Fora de escopo nesta fase

Ver `AGENTS.md`/histórico do projeto — sem compartilhamento entre usuários, sem OCR, sem outras UFs além de MG, sem catálogo de produtos, sem relatórios/gráficos, sem autenticação, sem web/PWA.
