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
