# Kompras — Fase 0 (Dogfooding)

App mínimo de lista de compras para validar a dor pessoal do fundador antes de decidir lançamento/modelo de negócio. Uso individual, local, mobile, sem backend.

## Stack

- React Native + Expo (SDK 57), TypeScript estrito
- SQLite local via `expo-sqlite` (migrações versionadas em `src/db/database.ts`)
- QR Code via `expo-camera`; foto/galeria via `expo-image-picker`; PDF via `expo-document-picker`
- Leitura da NFC-e do portal Sefaz-MG dentro de um `react-native-webview` (o portal exige passar por um desafio Cloudflare, que um `fetch` não consegue)
- Sem autenticação, sem backend — tudo fica no aparelho

## Rodando o projeto

```bash
npm install
npm start
```

Abra no dispositivo com o app Expo Go (Android/iOS) ou em um emulador.

## Testes

```bash
npm run typecheck   # tsc no app e nos testes
npm test            # parser da NFC-e + camada SQLite (runner nativo do Node, sem Jest)
```

- Exige **Node >= 22.13** (os testes de banco usam o `node:sqlite` embutido).
- `tests/nfce.test.ts` cobre `src/utils/nfce.ts`; os HTMLs em `tests/fixtures/` são **sintéticos** — veja `tests/fixtures/README.md` para trocá-los por capturas reais.
- `tests/db.test.ts` roda as migrações e o repositório reais contra um SQLite em memória (shim em `tests/helpers/sqliteShim.ts`). Ele não reproduz a semântica de conexões do `expo-sqlite`, só o SQL.
- No GitHub Actions, `.github/workflows/ci.yml` roda isso nos PRs, e o build EAS só começa depois que passa.

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

1. **Listas de compras** — criar, nomear/renomear e excluir; itens com quantidade (aceita decimais, ex.: `0,5` kg), marcar como "pego", colar várias linhas de uma vez. Uma lista fechada fica somente leitura até ser reaberta.
2. **Fechar compra** — escanear o QR do cupom (câmera ao vivo, foto ou imagem da galeria). O app abre o portal da Sefaz-MG num WebView; você passa pela verificação, toca em "Visualizar" e depois em "Capturar dados do cupom". O parser (`src/utils/nfce.ts`) extrai itens, total e data, e **confere a soma dos itens com o total**: se não bater (desconto ou item não lido), pergunta antes de salvar. Se o parse falha, dá para compartilhar o HTML limpo para diagnóstico. Sem QR: foto do cupom inteiro, PDF do cupom ou só o valor total — essas opções não dependem da permissão de câmera do scanner.
3. **Planejado × comprado** — no detalhe da compra, compara a lista com o cupom: o que foi comprado, o que ficou de fora e o que entrou **fora da lista** (valor e % dos itens). O app sugere o vínculo item da lista ↔ item do cupom por palavras em comum (`src/utils/matching.ts`); toque num item para corrigir ou desvincular. Sem itens de cupom (valor manual), usa só o "pego" da lista.
4. **Histórico** — compras fechadas, com itens, valores, foto/PDF do cupom e o comparativo. Dá para excluir uma compra (apaga itens e anexo e, se era a única da lista, reabre a lista).

## Estrutura

```
src/
  db/            # schema/migrações SQLite e funções de acesso a dados
  navigation/    # stack de navegação
  screens/       # telas do app
  components/    # PlanComparison (planejado × comprado), LinkPicker
  types/         # tipos compartilhados
  utils/         # nfce (parser), matching, comparison, quantity, format, receiptPhoto, purchaseActions
tests/           # testes unitários (Node test runner) e fixtures
```

## Fora de escopo nesta fase

Sem compartilhamento entre usuários, sem OCR, sem outras UFs além de MG, sem catálogo de produtos (o vínculo planejado × comprado só usa palavras em comum), sem relatórios/gráficos, sem autenticação, sem web/PWA.

## Limitações conhecidas

- **Os dados vivem só no aparelho.** Não há backup nem sincronização: desinstalar o app (ou limpar seus dados) apaga listas, compras e anexos.
- **A leitura da NFC-e depende do portal da Sefaz-MG** (layout e desafio Cloudflare) e exige os passos manuais descritos acima. Se o layout mudar, o parser precisa de ajuste — use "Compartilhar dados técnicos".
- **O casamento lista ↔ cupom é uma sugestão.** Erra abreviações ("refri" ↔ "COCA COLA 2L"); a correção é manual. Cada vínculo guarda se foi `auto` ou `manual` (`purchase_item.list_item_link_source`) para medir a taxa de acerto.
- Os HTMLs em `tests/fixtures/` são sintéticos, não capturas reais.
