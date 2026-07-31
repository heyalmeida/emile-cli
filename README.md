# emile-cli

**CLI Premium Code Assistant** para desenvolvimento rápido e produtivo, utilizando modelos de IA via API Requesty. Com suporte a caching de prompts, esforço de raciocínio, planos de implementação, habilidades e integração com protocolos MCP.

---

## 🔍 Descrição
emile-cli é uma ferramenta de linha de comando para desenvolvedores que Busca otimizar workflows de programação utilizando modelos de IA avançados, com:

- **Prompt Caching**: Reduzir custos e acelerar execuções repetidas
- **Controle de Esforço**: Ajustar profundidade do raciocínio (low, medium, high, max)
- **Planos de Implementação**: Organizar projetos complexos com estrutura EMILE
- **Habilidades Personalizáveis**: Extensibilidade via sistema de plugins
- **Integração MCA**: Suporte direto ao ModelContextProtocol

---

## 📁 Conteúdo do Projeto
```
├── .agent/              # Contexto interno de agentes
│   ├── ...
├── .emile/              # Configurações de agente
│   ├── ...
├── .env*                # Variáveis de ambiente
│   ├── ...
├── .git/                # Controle de versão
│   ├── ...
├── src/                 # Código fonte principal
│   ├── cli.js           # Interface CLI
│   ├── mcp.js           # Integração protocolo
│   ├── agent.js         # Motor de agentes
│   ├── ui.js            # Interface interativa
│   └── ...
├── package.json         # Dependências Node.js
├── bin/emile.js         # Executável CLI
├── docs/                # Documentação arquitetural
├── implementation_plan.md # Estrutura para projetos complexos
├── task.md              # Tarefas definidas manualmente
├── ui-inspiration.mp4   # Demonstração visual
└── ...
```

---

## ⚙️ Instalação

### Prerequisites
```bash
node >= 16.0.0
npm >= 8.0.0
```

### Instalando
```bash
npm install -g emile-cli
```

### Iniciando
```bash
emile "Descreva sua tarefa em linguagem natural"
```

---

## 📈 Comandos Básicos

```bash
emile "Crie um servidor REST em Node.js"  # Execução principal
emile -m gpt-4 -e high "Refatore código legacy"  # Configurações avançadas
emile /switch Sessions/ProjetoA.md        # Reutilizar histórico
emile /help                               # Lista de comandos
```

---

## 🛠️ Funcionalidades Principais

| Recurso                  | Descrição                                      |
|-------------------------|------------------------------------------------|
| **Caching de prompt**   | Salvar prompts executados para reutilização   |
| **Planos EMILE**        | Dividir projetos complexos em etapas lógicas |
| **Habilidades**         | Plugin system para funcionalidades customizáveis |
| **MCP Support**         | Integração com ModelContextProtocol            |
| **Histórico**           | Salvar e restaurar conversas completas        |

---

## 📝 Arquitetura EMILE

O projeto segue o modelo EMILE com componentes modulares:
1. **MCP Core**: Interface entre a CLI e servidores de IA
2. **Agent Layer**: Motor de raciocínio principal
3. **UI**: Interface interativa com prompts
4. **Session Manager**: Persistência de contextos
5. **Tool Manager**: Execução de ações no workspace

---

## 📚 Documentação
Documentação técnica completa: [Docs/implementation_plan.md](Docs/implementation_plan.md)

---

## 📝 Reportes de Implementação
Verificação de arquitetura disponível no histórico de auditorias.
---

## 🧑‍💻 Créditos

Desenvolvido por Arctis Dev para projetos de IA responsável.
Dependências principais:
- [clack/prompts](https://github.com/clack/prompts)
- [MCA SDK](https://github.com/modelcontextprotocol/sdk)
- [OpenAI Compatible Models](https://platform.openai.com/docs)

---

## 📄 Licença
MIT License - Ver arquivo [LICENSE](LICENSE) para detalhes completos.

---

## 🧪 Recursos Adicionais

- `emile --version`: Verificar versão instalada
- `emile --help`: Manual de uso completo
- `emile --dry-run`: Testar execução sem modificar arquivos