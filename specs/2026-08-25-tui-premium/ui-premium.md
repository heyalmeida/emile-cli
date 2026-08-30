# emile — UI Premium Redesign
> Objetivo: design minimalista nível Claude Code. Código direto para `src/ui.js`.

---

## Diagnóstico visual

Comparando os screenshots com o Claude Code, os problemas centrais são:

1. **Peso visual excessivo** — a box `tools` com bordas ao redor dos tool calls cria ruído desnecessário. Claude Code mostra tools como linhas simples.
2. **Duas linhas de status por operação** — `✓ 1 tool completed` + `✓ response received` aparecem dezenas de vezes numa sessão longa.
3. **Thinking visível demais** — o raciocínio interno compete visualmente com o conteúdo real.
4. **Sem ritmo vertical** — espaçamento inconsistente entre blocos.
5. **Colunas desalinhadas** nos tool calls — `Exec`, `Read`, `Write` têm larguras diferentes, quebrando o grid.

---

## 1. Tool calls — de box para linhas alinhadas

**Antes (atual):**
```
┌─ tools ─────────────────────────────────────────────┐
│ ● Exec    git log --all --format='%H %ae' | grep... │
└─────────────────────────────────────────────────────┘
✓ 1 tool completed
```

**Depois (estilo Claude Code):**
```
  ● exec   git log --all --format='%H %ae' | grep mc33; echo '---REFS--
  ● read   src/tools.js
  ● grep   image|vision|base64|image_url
```

**Implementação em `src/ui.js`:**

```js
// Paleta semântica por tipo de tool
const TOOL_COLORS = {
  exec:    '\x1b[38;5;203m', // coral    — efeito colateral potencial
  read:    '\x1b[38;5;39m',  // azul     — passivo, informacional
  write:   '\x1b[38;5;226m', // amarelo  — modifica estado
  edit:    '\x1b[38;5;226m', // amarelo  — modifica estado
  grep:    '\x1b[38;5;220m', // gold     — busca
  find:    '\x1b[38;5;220m', // gold
  list:    '\x1b[38;5;240m', // cinza    — baixo impacto
  default: '\x1b[38;5;252m',
};

const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';

// Largura fixa para a coluna do tipo (alinhamento de grid)
const TOOL_LABEL_WIDTH = 8;

export function renderToolCall(toolName, args) {
  const type  = toolName.toLowerCase().replace(/file|dir|command|search/gi, '').trim() || toolName;
  const color = TOOL_COLORS[type] || TOOL_COLORS.default;
  const label = type.padEnd(TOOL_LABEL_WIDTH);

  // Truncar args para caber na largura do terminal
  const maxArgWidth = process.stdout.columns - TOOL_LABEL_WIDTH - 8;
  const argStr = truncate(formatArgs(args), maxArgWidth);

  process.stdout.write(`  ${color}●${RESET} ${DIM}${label}${RESET} ${argStr}\n`);
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatArgs(args) {
  if (typeof args === 'string') return args;
  // Para file tools, mostrar o path. Para exec, o comando.
  return args.command ?? args.path ?? args.pattern ?? JSON.stringify(args);
}
```

---

## 2. Status — eliminar o ruído

As duas linhas de status viraram decoração. A presença da resposta do agente já confirma que a tool rodou.

**Antes:**
```
✓ 1 tool completed
✓ response received
* Thinking...
```

**Depois:**
```
  (nada — ou uma única linha compacta quando relevante)
```

**Implementação:**

```js
// Em vez de imprimir status após cada tool, apenas contar
// e mostrar um sumário inline no início da resposta do agente

let toolsRunThisTurn = 0;

export function onToolComplete() {
  toolsRunThisTurn++;
}

export function renderAgentResponseHeader() {
  if (toolsRunThisTurn === 0) return;

  const label = toolsRunThisTurn === 1
    ? '1 tool'
    : `${toolsRunThisTurn} tools`;

  process.stdout.write(`\n  ${DIM}↳ ${label}${RESET}\n`);
  toolsRunThisTurn = 0;
}
```

Resultado visual:
```
  ● exec   git log --all ...
  ● read   src/api.js

  ↳ 2 tools

  emile  A boa notícia: os dados já estão corretos...
```

---

## 3. Thinking stream — quase invisível

O thinking deve existir mas não distrair. Cor muito próxima do fundo.

**Antes:**
```
* Thinking...
GitHub still shows 2 contributors. Possible reasons:
1. Cache — takes time.
```

**Depois:**
```
  ··· thinking
```
(cor `#3a3a3a` em dark theme — quase invisível, mas presente)

**Implementação:**

```js
const THINKING_COLOR = '\x1b[38;5;238m'; // cinza muito escuro

export function startThinking() {
  process.stdout.write(`  ${THINKING_COLOR}··· thinking${RESET}`);
}

export function clearThinking() {
  // Limpar a linha do thinking ao receber a resposta
  process.stdout.write('\r\x1b[2K');
}

// Se o usuário tiver /thinking ativo (expanded mode), mostrar o conteúdo
// mas ainda assim bem dimmed
export function renderThinkingChunk(text, expanded = false) {
  if (!expanded) return; // oculto por padrão

  const lines = text.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      process.stdout.write(`  ${THINKING_COLOR}${DIM}${line}${RESET}\n`);
    }
  }
}
```

---

## 4. Resposta do agente — box mais refinada

**Antes:** border com `─` e label `emile` no canto sem padding interno.

**Depois:** padding interno + border mais sutil + separador de seção limpo.

```js
const BORDER_COLOR = '\x1b[38;5;239m'; // cinza escuro
const LABEL_COLOR  = '\x1b[38;5;75m';  // azul claro (mesmo tom do nome no header)

export function renderAgentBox(contentLines, label = 'emile') {
  const width = Math.min(process.stdout.columns - 4, 88);
  const innerWidth = width - 2;

  // Header
  const labelStr = ` ${label} `;
  const borderRight = '─'.repeat(innerWidth - labelStr.length - 1);
  process.stdout.write(
    `\n  ${BORDER_COLOR}╭${LABEL_COLOR}${labelStr}${BORDER_COLOR}${borderRight}╮${RESET}\n`
  );

  // Conteúdo com padding
  for (const line of contentLines) {
    const wrapped = wrapLine(line, innerWidth - 2); // 1 espaço de cada lado
    for (const wl of wrapped) {
      const padding = ' '.repeat(innerWidth - 2 - visibleLength(wl));
      process.stdout.write(`  ${BORDER_COLOR}│${RESET} ${wl}${padding} ${BORDER_COLOR}│${RESET}\n`);
    }
  }

  // Footer
  process.stdout.write(`  ${BORDER_COLOR}╰${'─'.repeat(innerWidth)}╯${RESET}\n\n`);
}
```

---

## 5. Ritmo vertical — regra de 3 níveis

Aplicar via constantes no topo do `ui.js`:

```js
// Espaçamento semântico — use esses, não `\n\n` espalhados pelo código
export const GAP = {
  none:    '',        // dentro do mesmo bloco (ex: tool calls consecutivos)
  section: '\n',     // entre tool calls e resposta do agente
  command: '\n\n',   // entre comandos distintos do usuário
};
```

**Uso:**
```js
renderToolCall('exec', 'git log...');
renderToolCall('read', 'src/api.js');
process.stdout.write(GAP.section);
renderAgentResponseHeader();
renderAgentBox(responseLines);
process.stdout.write(GAP.command);
```

---

## 6. Divisória de comando — separar sessões

Quando o usuário manda uma mensagem nova, criar um divisor sutil:

```js
export function renderCommandDivider(userInput) {
  const width = Math.min(process.stdout.columns - 4, 88);
  const truncated = truncate(userInput, width - 6);
  const border = `${'─'.repeat(2)} ${truncated} `;
  const rest   = '─'.repeat(Math.max(0, width - visibleLength(border)));

  process.stdout.write(`\n  ${BORDER_COLOR}${border}${rest}${RESET}\n\n`);
}
```

Resultado:
```
  ── Ainda no site do github continua com 2 contas ────────────────────
```

---

## 7. Painel de configuração — `off` em cinza

```js
const STATUS_ON  = '\x1b[38;5;114m'; // verde suave
const STATUS_OFF = '\x1b[38;5;240m'; // cinza — neutro, não erro

function renderStatus(value) {
  return value
    ? `${STATUS_ON}on${RESET}`
    : `${STATUS_OFF}off${RESET}`;
}
```

---

## Ordem de implementação sugerida

| # | Item | Arquivo | Impacto | Esforço |
|---|------|---------|---------|---------|
| 1 | Eliminar linhas de status duplicadas | `ui.js` / `agent.js` | Alto | Baixo |
| 2 | Tool calls sem box, com grid alinhado | `ui.js` | Alto | Baixo |
| 3 | Thinking quase invisível por padrão | `ui.js` | Médio | Baixo |
| 4 | Padding interno no box de resposta | `ui.js` | Médio | Baixo |
| 5 | Cor `off` cinza no painel de config | `ui.js` | Baixo | Baixo |
| 6 | Divisória de comando | `ui.js` | Médio | Médio |
| 7 | Ritmo vertical com `GAP` | `ui.js` + todos os callers | Alto | Médio |

---

## Referência de cores (Tokyo Night, mesmo tema atual)

O roxo foi substituído. Três opções de acento quente — escolha uma:

```js
// Opção A — Gold (#ffd700) — mais yellow, sofisticado, distinto do Claude Code
const COLORS = {
  blue:    '\x1b[38;5;39m',   // #00bfff — read, links, labels
  orange:  '\x1b[38;5;203m',  // #ff5f5f — exec (coral, não o laranja do Claude Code)
  yellow:  '\x1b[38;5;226m',  // #ffff00 — write, edit
  gold:    '\x1b[38;5;220m',  // #ffd700 — grep, find  ← substitui o roxo
  green:   '\x1b[38;5;114m',  // #87d787 — success, on
  gray:    '\x1b[38;5;240m',  // #585858 — off, metadata
  dimgray: '\x1b[38;5;238m',  // #444444 — thinking
  border:  '\x1b[38;5;239m',  // #4e4e4e — bordas
};

// Opção B — Amber (#ffaf00) — entre gold e laranja, mais quente
const COLORS = {
  // ...
  amber:   '\x1b[38;5;214m',  // #ffaf00 — grep, find
  // exec fica em coral para não colidir:
  exec:    '\x1b[38;5;203m',  // #ff5f5f
};

// Opção C — Laranja coral (#ff875f) — mais saturado, energético
const COLORS = {
  // ...
  coral:   '\x1b[38;5;209m',  // #ff875f — grep, find (tom de pôr-do-sol)
  // exec mais escuro para manter hierarquia:
  exec:    '\x1b[38;5;196m',  // #ff0000 vermelho vivo — destaca risco
};
```

**Recomendação:** Opção A (gold `#ffd700`). É distinto do Claude Code (que usa `#ff8700`), funciona bem em dark terminal, e cria uma paleta coerente com o azul e verde já presentes.
