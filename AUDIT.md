# Relatório de Auditoria Técnica e Mapa de Arquitetura — Emile CLI

Este documento fornece um mapeamento detalhado da arquitetura, dependências, estrutura de arquivos e fluxos de controle do projeto **Emile CLI**, estruturado para consumo direto por agentes inteligentes e desenvolvedores.

---

## 1. Visão Geral do Sistema
O **Emile CLI** é um assistente autônomo de programação baseado em linha de comando (CLI) escrito em Node.js (ES Modules). Ele lê e manipula o sistema de arquivos local do host, realiza operações de leitura, gravação e substituição de arquivos, e executa comandos de console sob demana usando modelos LLM integrados.

### Recursos Principais
- **Prompt Caching:** Suporte nativo a caching de prompts via cabeçalhos e payloads estendidos da API do Requesty.
- **Reasoning Effort:** Configuração do nível de esforço de raciocínio para modelos baseados em raciocínio lógico (e.g., o1, o3, Gemini 2.0/2.5 Thinking).
- **Plans Mode (Modo de Planejamento):** Pipeline em duas etapas que primeiro desenha o plano de alteração no arquivo `implementation_plan.md`, obtém a aprovação do usuário e, em seguida, executa incrementalmente atualizando o checklist `task.md`. Pode ser alternado dinamicamente no REPL pressionando a tecla **TAB**.
- **Reasoning Effort:** Configuração do nível de esforço de raciocínio para modelos baseados em raciocínio lógico (e.g., o1, o3, Gemini 2.0/2.5 Thinking). Pode ser ciclado ciclicamente no REPL pressionando **Ctrl+T**.
- **Plans Mode Retomável:** Na inicialização interativa, detecta se existem arquivos de planos anteriores no workspace e oferece a opção de retomar a execução a partir do ponto de parada.
- **Model Context Protocol (MCP):** Conexão dinâmica com servidores MCP usando comunicação via stdio, expondo as ferramentas do servidor para o LLM.
- **Active Skills (Skills Modulares) & Auto-detecção:** Injeção dinâmica de diretivas no prompt de sistema a partir de arquivos `.agent/skills/<skill_name>/SKILL.md`. O CLI também analisa a pilha do workspace (package.json, arquivos Docker, Prisma, etc.) e ativa automaticamente as skills recomendadas.
- **Centralized Visual Engine:** Console adaptável com bordas elegantes ("boxy style"), cálculo dinâmico de largura para se adaptar ao redimensionamento da janela de terminal e renderizador markdown personalizado. Mostra informações de rodapé com o Modo ativo (Build/Plan) e o nível de Esforço (none/low/medium/high).
- **Segurança de Comando (Safe Gate):** Roda comandos de console com um gate de confirmação interativo para comandos que não estão em uma whitelist de comandos seguros, além de suportar um timeout configurável de 30s para evitar travamento de subprocessos.
- **Controle de Simulação (Dry Run):** Flag `--dry-run` para rodar o agente em modo de simulação, imprimindo diffs de arquivos e comandos shell em vez de escrevê-los no disco físico.
- **Rollback de Arquivos (Pilha de Undo):** Comando interativo `/undo` para reverter as últimas edições ou exclusões de arquivos feitas pelo agente na sessão ativa.
- **Gerenciamento de Custos e Janela de Contexto:** Acumula tokens e calcula em tempo real o custo financeiro aproximado da sessão ativa. Conta com um gateway de compressão automática do histórico de mensagens antigas caso a janela do contexto se aproxime do limite (~30k tokens).

---

## 2. Pilha de Tecnologia e Dependências (`package.json`)
O projeto é estruturado em Node.js com o formato `"type": "module"`. As dependências principais são:

- **`commander` (v11.1.0):** Parser de linha de comando para tratar argumentos e opções (como `-m`, `-e`, `-p`, `--no-cache`, `-s`, `-H`, `--no-safe`, `--dry-run`).
- **`@clack/prompts` (v0.7.0):** Componentes interativos de terminal (spinners, caixas de seleção, campos de texto, confirmações e senhas).
- **`@modelcontextprotocol/sdk` (v1.0.1):** SDK oficial para conexão, handshake, listagem e chamada de ferramentas em servidores MCP.
- **`openai` (v4.28.0):** Cliente de comunicação adaptado para realizar requisições REST compatíveis com OpenAI para Requesty e OpenRouter.
- **`diff` (v9.0.0):** Usado para calcular diffs de linhas e exibir visualmente as alterações de arquivos no console após criações ou edições.
- **`dotenv` (v16.4.5):** Carregador de variáveis de ambiente do arquivo `.env` local.
- **`js-yaml` (v4.1.0):** Parser de arquivos YAML para decodificar cabeçalhos (frontmatter) de skills e agentes.
- **`picocolors` (v1.0.0):** Biblioteca leve para estilização e aplicação de cores ANSI no console.
- **`zod` (v3.22.4):** Biblioteca de validação de schemas em tempo de execução.

---

## 3. Arquitetura de Código-Fonte (`src/` & `bin/`)

Abaixo estão detalhados os arquivos de execução do projeto e suas responsabilidades específicas:

### 📄 [bin/emile.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/bin/emile.js)
- **Responsabilidade:** Ponto de entrada global (Entrypoint).
- **Funcionamento:**
  - Contém o shebang `#!/usr/bin/env node`.
  - Desativa avisos de depreciação globalmente (`process.noDeprecation = true`) para manter o console limpo de avisos de terceiros.
  - Importa a função `main` do arquivo `src/cli.js` e executa-a tratando falhas fatais com `process.exit(1)`.

### 📄 [src/cli.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/cli.js)
- **Responsabilidade:** Orquestrador principal da interface CLI e loop interativo (REPL).
- **Funcionamento:**
  - Configura opções e lê argumentos usando `commander`, suportando novos flags como `--no-safe` e `--dry-run`.
  - Exibe a tela de inicialização com a arte ASCII de `src/ASCI.txt`.
  - Configura as variáveis globais de segurança: `config.dryRun` e `config.safeMode`.
  - Verifica credenciais do usuário; caso não existam, inicia o wizard de conexão (`src/commands.js`).
  - Conecta aos servidores MCP listados no arquivo `mcp.json` do workspace através do `src/mcp.js`.
  - Trata o desligamento seguro do processo (SIGINT), fechando as conexões MCP.
  - Suporta dois modos de execução:
    1. **Execução Direta:** Se um prompt é fornecido como argumento do CLI, roda o agente uma vez e encerra salvando a sessão.
    2. **Loop Interativo (REPL):** Exibe uma barra de status dinâmica da sessão ativa (mostrando sessionId, modelo ativo, quantidade de mensagens, tokens acumulados e custos estimados em dólares e reais) e aceita comandos barra especiais:
       - `/connect`: Reconfigura a chave de API e o provedor.
       - `/model`: Wizard interativo para selecionar modelos.
       - `/switch` / `/sessions`: Menu interativo para gerenciar, deletar ou retomar históricos de conversa.
       - `/new` / `/clear`: Inicia uma conversa limpa gerando um novo identificador de sessão.
       - `/undo`: Popa a pilha `undoStack` e reverte a última alteração física no sistema de arquivos local (restaurando conteúdo ou excluindo arquivos recém-criados).
       - `/cost`: Imprime detalhadamente a contagem de tokens de entrada/saída acumulada e custo financeiro estimado.
       - `/export`: Gera um arquivo markdown formatado no workspace (`emile-session-<timestamp>.md`) salvando todo o histórico de mensagens e execuções de ferramentas da sessão ativa.
       - `/help`: Exibe a tabela de ajuda com todos os comandos disponíveis atualizados.

### 📄 [src/agent.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/agent.js)
- **Responsabilidade:** Motor principal do Agente Inteligente.
- **Funcionamento:**
  - Compila o prompt do sistema através do `src/prompt.js`, combinando as diretivas base do Émile com as skills ativas e o contexto do workspace.
  - **Limpeza de Cache:** Limpa o cache local de leitura de arquivos no início de cada turno de interação física.
  - **Compressão de Histórico (Context Compression Gate):** Verifica o tamanho do histórico. Se o total exceder 120.000 caracteres (~30k tokens), aciona uma subcompletação para sintetizar as mensagens antigas em um único resumo estruturado, preservando os metadados cruciais e as últimas 6 mensagens intactas.
  - Gerencia o loop de execução da API: envia o histórico, extrai e exibe o raciocínio oculto (reasoning content / tags `<think>`), renderiza a resposta e manipula chamadas de ferramentas.
  - Executa as ferramentas do LLM em lote (paralelismo de tool_calls), determinando se a chamada pertence às ferramentas nativas (`src/tools.js`) ou às ferramentas MCP do workspace (`src/mcp.js`).
  - **Custo e Tokens:** A cada turno, parseia o objeto `response.usage` para acumular a contagem total de tokens da sessão e estimar os custos USD de acordo com a precificação de cada modelo suportado (Claude 3.5 Sonnet, Gemini 2.5 Pro/Flash, GPT-4o, DeepSeek).

### 📄 [src/api.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/api.js)
- **Responsabilidade:** Cliente HTTP e interface de comunicação com a LLM.
- **Funcionamento:**
  - Cria e armazena em cache o cliente da API `OpenAI` baseado nas configurações ativas.
  - Configura dinamicamente a URL base (`baseURL`) de acordo com o provedor selecionado:
    - **Requesty:** `https://router.requesty.ai/v1`
    - **OpenRouter:** `https://openrouter.ai/api/v1` (inclui cabeçalhos exigidos como `HTTP-Referer` e `X-Title`).
  - Adiciona payloads de caching de contexto para o Requesty: injeta `extra_body: { requesty: { auto_cache: true } }` se a otimização de cache estiver ativa.
  - Passa parâmetros de raciocínio profundo no parâmetro `reasoning_effort` (low, medium, high, max, min, none).

### 📄 [src/commands.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/commands.js)
- **Responsabilidade:** Implementa os assistentes interativos de configuração.
- **Funcionamento:**
  - `runConnectWizard()`: Cria caixas de diálogo para escolher o provedor (Requesty ou OpenRouter), insere a chave de API de forma camuflada (senha) e salva as alterações em `.emile/config.json`, forçando o reset do cliente da API.
  - `runModelWizard()`: Fornece uma lista com curadoria de modelos recomendados baseada no provedor ativo e permite a entrada de identificadores customizados (ex: `deepseek/deepseek-reasoner`).

### 📄 [src/config.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/config.js)
- **Responsabilidade:** Leitura e persistência de dados de configuração.
- **Funcionamento:**
  - Carrega variáveis de ambiente de um arquivo `.env` local como plano de fundo.
  - Cria recursivamente a pasta `.emile/` no workspace do usuário.
  - Grava e lê configurações persistidas no arquivo `.emile/config.json`.
  - Lê o arquivo `mcp.json` na raiz do diretório do usuário para identificar configurações de servidores MCP locais.
  - Armazena as propriedades estendidas de runtime: `config.dryRun` (default: false), `config.safeMode` (default: true) e `config.commandTimeout` (default: 30000 ms).

### 📄 [src/history.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/history.js)
- **Responsabilidade:** Armazenamento e gerenciamento do histórico de conversas.
- **Funcionamento:**
  - Salva o estado bruto das mensagens em formato JSON estruturado dentro do diretório `.emile/history/session_*.json`.
  - Preserva a data de criação original (`createdAt`) de sessões que sofreram atualizações.
  - Lista os arquivos de histórico locais, lê seus metadados (`summary`, `updatedAt`) e classifica-os do mais recente para o mais antigo.
  - Expõe funções para carregar e deletar sessões de histórico específicas do workspace.

### 📄 [src/mcp.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/mcp.js)
- **Responsabilidade:** Integração e comunicação com o Model Context Protocol (MCP).
- **Funcionamento:**
  - Lê a configuração `mcpServers` de `config.js` e inicia subprocessos locais via transporte Stdio (`StdioClientTransport`) enviando os comandos, argumentos e variáveis de ambiente configurados.
  - Conecta com os servidores e recupera a lista de ferramentas declaradas por eles.
  - **Conversão de Schemas:** Traduz e envelopa as definições de ferramentas do MCP para o formato compatível com o OpenAI. Para evitar colisões de nomenclatura entre diferentes servidores, as ferramentas são registradas no formato: `serverName__toolName` (dois underlines).
  - **Execução:** Intercepta chamadas com prefixo MCP, encaminha a chamada contendo os argumentos serializados para o respectivo cliente do servidor conectado e extrai a resposta (formatando conteúdos textuais, JSON brutos ou capturando tags de imagem base64).

### 📄 [src/plans.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/plans.js)
- **Responsabilidade:** Monitor de progresso do Plans Mode.
- **Funcionamento:**
  - Verifica fisicamente se o arquivo `implementation_plan.md` existe na raiz do projeto.
  - Lê e decodifica as linhas do arquivo `task.md` do workspace, buscando padrões de checklist (`[ ]`, `[x]`, `[/]`).
  - Renderiza mensagens de progresso no terminal com o número de tarefas concluídas (ex: `Plan Progress: X/Y tasks completed`).

### 📄 [src/prompt.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/prompt.js)
- **Responsabilidade:** Compilador do System Prompt do LLM.
- **Funcionamento:**
  - Mantém as regras estruturais e de tom base do assistente Émile (regras de declínio, ausência de placeholders, integridade de código, auto-correção).
  - Anexa informações de runtime do host (Sistema Operacional local e Caminho absoluto do Workspace).
  - **Injeção de Contexto do Workspace:** Compila e injeta em `=== WORKSPACE CONTEXT ===` informações extraídas em tempo real sobre a estrutura de arquivos da raiz do projeto, as seções iniciais do README.md e trechos do package.json para dar consciência imediata à IA.
  - Se `plansMode` estiver ativado, injeta instruções estritas obrigando o modelo a desenhar o plano de implementação em `implementation_plan.md` e a criar/atualizar a lista de tarefas em `task.md`.
  - Solicita ao `src/skills.js` as diretrizes textuais das skills ativas e anexa-as sob a tag `=== ACTIVE WORKSPACE SKILLS ===`.

### 📄 [src/skills.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/skills.js)
- **Responsabilidade:** Descobridor e parser de skills do Antigravity Kit.
- **Funcionamento:**
  - Escaneia a pasta local `.agent/skills/` à procura de subpastas que contenham arquivos `SKILL.md`.
  - Parseia arquivos `SKILL.md` dividindo-os em cabeçalho YAML e corpo de instruções Markdown.
  - **Auto-detecção (Workspace Fingerprinting):** Implementa `detectWorkspaceSkills()` para inspecionar dependências declaradas no `package.json` e arquivos do repositório, ativando automaticamente as skills correspondentes (`react-patterns`, `typescript-expert`, `prisma-expert`, `docker-expert`, `python-patterns`, etc.) caso o usuário inicialize com a opção `"all"`.
  - Filtra as skills autorizadas a rodar no prompt e compila suas instruções para serem injetadas diretamente na memória de sistema da IA.

### 📄 [src/tools.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/tools.js)
- **Responsabilidade:** Biblioteca de ferramentas nativas (Built-in Tools).
- **Funcionamento:**
  - Define o schema em formato JSON OpenAI e o handler de execução para 5 ferramentas locais:
    1. **`readFile`**: Lê o conteúdo de arquivos. Utiliza um cache em memória `fileCache` para evitar leitura redundante no mesmo ciclo. Resolve e valida os caminhos via `resolveSafePath` para proteger o sistema contra path traversal (lançando erro em rotas externas).
    2. **`writeFile`**: Escreve arquivos criando pastas recursivamente e exibe a diferença visual no terminal (diff) entre o estado original e o novo. Armazena o backup do estado anterior no histórico global `undoStack`. Respeita o modo `dryRun` apenas simulando o diff.
    3. **`editFile`**: Executa substituições exatas de blocos de código em arquivos e exibe o diff das linhas modificadas. Salva backup na `undoStack` e respeita a trava de dry-run.
    4. **`listDir`**: Lista arquivos e subpastas de um caminho marcando-os como `[DIR]` ou `[FILE]`.
    5. **`runCommand`**: Executa comandos shell assincronamente a partir da raiz do workspace.
       - **Safe Gate:** Se `config.safeMode` for verdadeiro, exige aprovação manual Clack para qualquer comando fora da whitelist segura (`git status`, `git diff`, `npm test`, etc.).
       - **Simulation:** Se `config.dryRun` for verdadeiro, apenas simula o comando.
       - **Timeout:** Aborta o processo caso ultrapasse 30 segundos (configurado em `config.commandTimeout`).

### 📄 [src/ui.js](file:///c:/Users/mc33p/Documents/GitHub/emile-cli/src/ui.js)
- **Responsabilidade:** Motor gráfico e renderizador do Terminal.
- **Funcionamento:**
  - `getW()`: Calcula dinamicamente a largura útil do terminal baseando-se no número de colunas atual do terminal, garantindo responsividade quando o usuário redimensiona ou maximiza a janela.
  - Desenha contornos em estilo "boxy" usando caracteres de caixa pesada (`┏ ━ ┓`, `┃`, `┣`, `┛`).
  - Implementa um parser e renderizador Markdown customizado em JavaScript para o terminal: colore cabeçalhos, formata listagens, destaca textos em negrito/itálico e delimita blocos de código com margens esquerdas elegantes (`┌─`, `│`, `└─`) colorindo tokens específicos de texto.
  - Lê e exibe a arte ASCII importada do arquivo `src/ASCI.txt`.
  - Exibe contadores de tokens acumulados e estimativas de custos financeiros USD e BRL na barra de status da sessão ativa.

---

## 4. O Ecossistema `.agent/` (Antigravity Kit)
O diretório `.agent/` é a infraestrutura de orquestração do **Antigravity Kit**, que funciona como um arcabouço de conhecimento, personas e rotinas de validação local:

### Estrutura de Pastas e Arquivos
- **`ARCHITECTURE.md`:** Mapa geral do kit detalhando os 19 especialistas, 36 skills, 11 workflows e scripts de validação.
- **`rules/GEMINI.md`:** Normas e políticas de comportamento do LLM na área de trabalho. Define o classificador de requisições, o classificador inteligente de roteamento de agentes, e o **Socratic Gate** (uma regra obrigatória de interrupção que exige a formulação de perguntas antes de qualquer tool de modificação caso haja dúvidas).
- **`agents/` (19 personas):** Arquivos markdown descrevendo as personalidades de agentes dedicados, tais como:
  - `orchestrator.md`, `project-planner.md`, `frontend-specialist.md`, `backend-specialist.md`, `database-architect.md`, `mobile-developer`, `debugger.md`, `security-auditor.md`, etc.
- **`skills/` (36 skills):** Pastas que estendem as competências da IA em tópicos específicos (e.g., `clean-code`, `api-patterns`, `react-patterns`, `vulnerability-scanner`, etc.). Cada pasta contém um arquivo `SKILL.md` (metadados YAML + diretrizes).
- **`workflows/` (11 workflows):** Guias procedimentais estruturados para automação de tarefas no kit (como `/create`, `/debug`, `/plan`, `/test` e `/ui-ux-pro-max`).
- **`scripts/` (Scripts de Validação em Python):**
  - **`checklist.py`:** Utilitário para rodar verificações rápidas no código local, executando rotinas de segurança, lint, type coverage, schemas de banco de dados, testes e validações de UX/SEO.
  - **`verify_all.py`:** Suite exaustiva de testes pré-deploy. Executa os testes do checklist e acrescenta testes de Lighthouse, Playwright E2E, análise de bundles de build e auditorias móveis.

---

## 5. Fluxos de Trabalho Críticos

### Fluxo de Inicialização e Handshake
```
[Início] 
   │
   ▼
[Suppress Deprecations] (emile.js)
   │
   ▼
[Load CLI Configs & .env] (config.js)
   │
   ▼
[CLI Options Parser] (cli.js)
   ├── Ativa flags --no-safe / --dry-run
   └── Ajusta config.safeMode e config.dryRun
   │
   ▼
[Se REPL & plano md e task md existem no workspace]
   ├── Sim ──► [Perguntar se deseja retomar plano]
   └── Não ──► [Pular verificação]
   │
   ▼
[Conectar Servidores MCP via Stdio] (mcp.js)
   │
   ▼
[Verificar Credenciais do Provedor]
   ├── Sim (API Key ausente?) ──► [Inicia runConnectWizard] (commands.js)
   └── Não ──► [Exibe ASCII, Configurações, Status de Tokens/Custos] (ui.js)
```

### O Loop de Execução e Aprovação do Plans Mode
```
[Prompt de Usuário no Plans Mode]
   │
   ▼
[Compila Prompt de Sistema com Skill de Planos + Contexto Auto do Workspace] (prompt.js)
   │
   ▼
[Chat Completion: LLM desenha o Plano] (agent.js)
   │
   ▼
[Exibe o Plano no Terminal] (ui.js)
   │
   ▼
[Approval Gate: Prompt Interativo de Confirmação]
   │
   ├── Usuário Rejeita/Cancela ──► [Aborta Operação]
   └── Usuário Aprova ("Yes")
         │
         ▼
     [LLM instruído a escrever implementation_plan.md e task.md]
         │
         ▼
     [Loop de Alteração Incremental usando readFile/editFile/writeFile]
         │
         ├── Salva backups originais na undoStack
         └── Valida path traversal em resolveSafePath
         │
         ▼
     [Atualização de Status de Tarefas no task.md e renderização na tela]
```

### Roteamento e Tradução de Ferramentas MCP
```
[Servidor MCP conectado via Stdio] (mcp.js)
   │
   ▼
[Listar Ferramentas do Servidor] (Ex: "greet")
   │
   ▼
[Registrar no LLM com prefixo: "everything__greet"]
   │
   ▼ (LLM chama a ferramenta "everything__greet")
[Recebe chamada no agent.js]
   │
   ▼
[Identifica prefixo "__" no mcp.js]
   │
   ▼
[Envia Payload JSON-RPC via stdio para o processo filho correspondente]
   │
   ▼
[Recebe retorno e formata como string para a resposta do LLM]
```

---
Este documento fornece o mapeamento completo e as especificações técnicas necessárias para o entendimento estrutural do repositório por qualquer agente de software ou LLM.
