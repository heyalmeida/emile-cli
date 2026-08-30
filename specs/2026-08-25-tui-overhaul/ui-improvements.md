# UI Improvements — emile CLI

> Análise baseada nos screenshots do terminal. Foco em hierarquia visual, ritmo de espaçamento e clareza operacional.

---

## 1. Hierarquia entre seções

**Problema:** Comandos como `/connect` e `/model` aparecem com o mesmo peso visual que qualquer linha de output. Quando o histórico cresce, fica difícil de escanear onde começa cada operação.

**Sugestão:**
```
  ╭─ /connect ──────────────────────────────────────────╮
  │  Connection Setup                                    │
  ╰──────────────────────────────────────────────────────╯
```
Ou mais simples, uma linha divisória com o comando embarcado:
```
  ── /connect ──────────────────────────────────────
```
Isso cria um "capítulo" visual claro sem precisar de muito espaço.

---

## 2. Diferenciação de ferramentas por cor

**Problema:** `• Exec`, `• Read`, `• Write`, `• Grep`, `• List` têm a mesma cor e peso. Numa sequência longa de tool calls é difícil identificar o que está acontecendo sem ler cada linha.

**Sugestão — paleta semântica:**

| Operação | Cor sugerida | Motivo |
|----------|-------------|--------|
| `Read`   | Azul        | passiva, informacional |
| `Write`  | Amarelo     | atenção, modifica estado |
| `Exec`   | Laranja/Vermelho | potencial de efeito colateral |
| `Grep`   | Magenta     | busca |
| `List`   | Cinza claro | listagem, baixo impacto |

O ícone `•` pode ficar, mas a cor do label e do path devem refletir isso.

---

## 3. Ruído de status

**Problema:** Após cada operação aparecem duas linhas separadas:
```
✓ 1 tool completed
✓ response received
```
Em sessões longas isso vira ruído puro — aparece dezenas de vezes sem agregar informação nova.

**Sugestão:** Combinar em uma linha inline ou suprimir quando não há erro:
```
✓ 2 tools  ·  response received
```
Ou simplesmente suprimir `response received` — o próprio box do emile já indica que a resposta chegou.

---

## 4. Bloco de thinking

**Problema:** O `* Thinking…` aparece como texto corrido em cor levemente diferente, mas ainda é visível como conteúdo primário. O raciocínio interno polui o fluxo principal.

**Sugestão:** Dimming mais agressivo + prefixo recuado:
```
    · thinking...
```
Cor bem próxima do fundo (ex: `#444` em dark theme). Opcionalmente, em sessões verbose, truncar após 1 linha com expansão manual (`[+]`).

---

## 5. Box de resposta do agente

**Problema atual:**
```
┌─ emile ──────────────────────────────────────────┐
│ Texto da resposta aqui...                        │
└──────────────────────────────────────────────────┘
```
O label `emile` no canto não tem muito destaque. O padding interno parece apertado (texto encostado na borda).

**Sugestão:**
- Padding horizontal mínimo de 1 espaço dentro da caixa
- Label com cor distinta ou em bold
- Border com cor levemente acentuada (ex: ciano apagado)

```
╭─ emile ────────────────────────────────────────╮
│                                                 │
│  Texto da resposta com espaço interno...        │
│                                                 │
╰─────────────────────────────────────────────────╯
```

---

## 6. Prompts interativos

**Problema:** O `o` (diamante) para opções selecionáveis não tem tratamento visual de "ativo vs inativo". Difícil distinguir qual item está sob o cursor.

**Sugestão:**
```
  ○  Option A
  ●  Option B  ← cursor aqui (bold + cor de destaque)
  ○  Option C
```
Item selecionado: bold + cor de acento (ex: ciano ou verde).
Item neutro: cinza.

---

## 7. Painel de configuração

**Estado atual:** já tem box, alinhamento de colunas razoável. Mas `off` em vermelho para cache/safe-gate pode confundir — vermelho geralmente sinaliza erro, não "desligado".

**Sugestão:**
- `off` → cinza apagado (não é um problema, só um estado)
- `on` → verde
- Valores ativos (model, provider) → bold branco

```
╭─ Configuration ──────────────────────────╮
│  provider    openrouter                  │
│  model       claude-3.5-sonnet  (low)    │
│  cache       off      safe-gate  off     │
╰──────────────────────────────────────────╯
```

---

## 8. Ritmo vertical (espaçamento)

**Problema:** O espaçamento entre elementos é inconsistente — às vezes há linha em branco, às vezes não. Sem uma regra clara, o output parece "solto".

**Regra sugerida:**
- 0 linhas entre itens do mesmo grupo (ex: tool calls consecutivos do mesmo turn)
- 1 linha entre grupos diferentes (ex: tool calls → resposta do agente)
- 2 linhas entre comandos distintos do usuário (`/connect`, `/model`, mensagem)

Isso cria ritmo sem precisar de mais elementos visuais.

---

## 9. Contexto persistente (header)

**Sugestão (opcional):** Fixar uma linha de contexto no topo durante a sessão:
```
  emile v1.0.0  ·  openrouter  ·  stealth/ox-alpha  ·  ~/meu-projeto
```
Evita que o usuário precise rodar `/model` ou olhar para o painel de config para saber o estado atual.

---

## Priorização

| # | Item | Impacto | Esforço |
|---|------|---------|---------|
| 1 | Ruído de status (item 3) | Alto | Baixo |
| 2 | Cor semântica por ferramenta (item 2) | Alto | Baixo |
| 3 | Dimming do thinking (item 4) | Médio | Baixo |
| 4 | Padding interno do box (item 5) | Médio | Baixo |
| 5 | Divisórias de seção (item 1) | Médio | Médio |
| 6 | Prompts interativos (item 6) | Médio | Médio |
| 7 | Cor do `off` no painel (item 7) | Baixo | Baixo |
| 8 | Ritmo vertical (item 8) | Alto | Alto |
| 9 | Header de contexto (item 9) | Baixo | Médio |
