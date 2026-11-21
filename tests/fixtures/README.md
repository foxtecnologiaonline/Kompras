# Fixtures de HTML de NFC-e

**Estes arquivos são SINTÉTICOS.** Foram escritos a partir do layout que
`src/utils/nfce.ts` documenta (portal Sefaz-MG, set/2026), não capturados de um
cupom real. Eles travam o comportamento atual do parser, mas **não provam** que
o portal real continua assim.

Para trocar por dados reais: no app, quando a captura falhar, use
"Compartilhar dados técnicos" (HTML já sem scripts/estilos), **remova dados
pessoais** (CPF, nome, endereço, chave de acesso) e salve aqui como
`real-*.html`. Depois acrescente um caso em `nfce.test.ts`.
