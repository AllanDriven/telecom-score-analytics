# 📊 Score Telecom Analytics

Um painel analítico avançado e dinâmico, desenhado especificamente para a observabilidade e tratamento contínuo das discagens, mailings e scores operacionais da **Telecom - Concentrix**.

---

## 🏗️ Estrutura do Projeto

O repositório foi reestruturado para manter o sistema auto-contido e livre de bagunça. Cada camada da aplicação tem a sua devida pasta.

```text
📁 PROJETO SCORE/QUERYS
│
├── 📁 backend/
│   ├── API_dados_score.py          # API Backend (Flask + PyODBC)
│   ├── alimenta_tabelas_score.py   # ETL / Carga de dados inicial
│   ├── .env                        # Arquivo COFRE (Nunca commitar senhas reais!)
│   ├── 📁 logs/ 
│   │   └── acessos_api.txt         # Arquivo de Logs gerados em tempo real pela API
│   └── 📁 diagnosticos_e_testes/   # Scripts criados para troubleshooting durante o desenolvimento
│
├── 📁 frontend/                    # Aplicação Desktop/Browser-based
│   ├── index.html                  # Dashboard View em HTML
│   ├── script.js                   # Toda a magia de Matemática, Motor Dinâmico e Exportação
│   └── style.css                   # Customização de Paletas de Cores Concentrix e Componentes
│
├── 📁 database_sql/                # Toda a infraestrutura do MS SQL Server Documentada
│   ├── SP_TAB_TELECOM_SCORE_CARTEIRAS_V2.sql (Nova Lógica - Score por Linha)
│   └── SP_TAB_TELECOM_NUMEROS_DISCADOS.sql
│
└── 📁 arquivos_antigos_logs/       # Logs depreciados gerados durante o desenvolvimento e debug da V2
```

---

## 🛠️ Tecnologias Utilizadas

### Backend:
*   **Python**: `Flask` como framework principal de micro-serviço e rotas de sistema.
*   **Banco de Dados**: `MS SQL Server` acessado via `pyodbc` utilizando ODBC Driver 17.
*   **Segurança**: Extensão `python-dotenv` para manter as credenciais e Server Address protegidos no arquivo `.env`.

### Frontend:
*   **Lógica e Gráficos**: Javascript Nativo + HTML + Chart.js (Motor de V2 100% Dinâmico que aceita novos scores automaticamente sem a necessidade de novos deploys).
*   **UI/UX**: Estilo Corporativo com `Bootstrap 5` (Glassmorphism e Custom Colors - Ex: Raspberry Pink e Jade Green).

---

## 🚀 Como Iniciar a Aplicação (Ambiente de Produção/Testes)

Para que a aplicação passe a ter tráfego de dados, é necessário iniciar o servidor Backend.

### 1️⃣ Subindo o Backend (API):
1. Abra o Terminal / PowerShell na pasta **`backend`**.
2. Garanta que o Python 3.10+ e as dependências (flask, pyodbc) estejam instaladas `pip install flask flask-cors pyodbc python-dotenv`.
3. Inicie o script:
   ```powershell
   python API_dados_score.py
   ```
4. A API Flask estará disponível internamente em `http://127.0.0.1:5001`.

### 2️⃣ Abrindo o Painel (Frontend Visual):
Sendo uma aplicação isolada (SPA) sem a necessidade atual de Web Server Frontend Ativo como Nginx, basta ir dentro da pasta **`frontend`** e abrir:
*   `index.html` em qualquer navegador compatível (Chrome, Edge).
*   O Painel fará a leitura automática conectando no IP `127.0.0.1:5001` da máquina host.

---

## 📜 Histórico de Versão (Changelog)

**Versão 2.1 - Score Dinâmico em Linhas** (A Atual)
> Diferente da versão originária (V1), a nova lógica (V2) e procedure elimina o travamento ocasionado pelo hardcode de colunas matemáticas de Score. A API extrai tudo em formato "row-based" da procedure no Database Telecom (`TAB_TELECOM_SCORE_CARTEIRAS_V2`). Isso possibilita escalar para centenas de labels e tipos de pontuações amanhã de forma natural e sistêmica sem modificar nenhuma linha de Javascript ou rotas de Python.
