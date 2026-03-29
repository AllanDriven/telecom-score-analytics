from flask import Flask, jsonify, request
from flask_cors import CORS
import pyodbc
import json
import logging
import os
import os
from datetime import date, datetime
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo .env (O Cofre Secreto!)
# Aponta exatamente para a pasta onde este script Python está salvo
caminho_base = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(caminho_base, '.env'))

# ==========================================================
# CONFIGURAÇÃO DE LOGS EM ARQUIVO TXT
# ==========================================================
# Cria (ou atualiza) um arquivo chamado 'acessos_api.txt' na subpasta 'logs' do script
os.makedirs(os.path.join(caminho_base, 'logs'), exist_ok=True)
logging.basicConfig(
    filename=os.path.join(caminho_base, 'logs', 'acessos_api.txt'),
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%d/%m/%Y %H:%M:%S'
)

# Garante que o servidor do Flask (Werkzeug) mande os logs de acesso para o arquivo
log_werkzeug = logging.getLogger('werkzeug')
log_werkzeug.setLevel(logging.INFO)
# ==========================================================

app = Flask(__name__)
CORS(app) 

def get_db_connection():
    # Agora as credenciais são puxadas da memória segura
    server = os.environ.get("DB_SERVER")
    database = os.environ.get("DB_DATABASE")
    user = os.environ.get("DB_USER")
    password = os.environ.get("DB_PASSWORD")
    
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={user};"
        f"PWD={password};"
    )
    return pyodbc.connect(conn_str)

# --- ROTA 1: DADOS DO PAINEL E DO RESUMO ---
@app.route('/api/dados-score')
def dados_score():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT
        CAST(A.DATE as VARCHAR(10)) as DATE,
        c.responsible_executive as EXECUTIVO,
        c.carteira_description as CARTEIRA,
        q.queue_code as FILA,
        s.server_name as SERVIDOR,
        m.mailing as MAILLING,
        A.SCORE_VALOR as SCORE_NOME,
        A.VOLUME_DISCAGENS,
        A.CUSTO_TOTAL
    FROM 
        dbo.TAB_TELECOM_SCORE_CARTEIRAS_V2 A WITH(NOLOCK)
        LEFT JOIN dbo.dimqueues q WITH(NOLOCK) ON q.queue_id = a.queue_id
        LEFT JOIN dbo.dimesteiramailings m WITH(NOLOCK) ON m.mailingId = a.mailingId
        LEFT JOIN dbo.dimcarteiras c WITH(NOLOCK) ON c.carteira_id = q.carteira_id
        LEFT JOIN dbo.dimdialerserver s WITH(NOLOCK) ON s.dialer_server_id = q.dialer_server_id
    """
    
    cursor.execute(query)
    columns = [column[0] for column in cursor.description]
    dados = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
    conn.close()
    return jsonify(dados)

# --- ROTA 2: NOVA EXTRAÇÃO DE NÚMEROS (TELEFONES) ---
@app.route('/api/extracao-numeros')
def extracao_numeros():
    data = request.args.get('data')
    executivo = request.args.get('executivo')
    carteira = request.args.get('carteira')
    fila = request.args.get('fila')
    mailing = request.args.get('mailing')
    score = request.args.get('score')

    # Validação de segurança: Não deixamos rodar sem os filtros obrigatórios
    if not data or not executivo or not carteira:
        return jsonify({"erro": "Data, Executivo e Carteira são obrigatórios."}), 400

    # Tira os traços da data para montar o nome da tabela (ex: 20260302)
    data_sem_traco = data.replace("-", "")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Monta a query dinamicamente baseada no que o usuário escolheu
        query = f"""
        SELECT 
            DISTINCT A.origem AS TELEFONE, 
            ISNULL(NS.SCORE, 5.0) AS SCORE
        FROM 
            Atlas.dbo.tb_Dialer_Calls_{data_sem_traco} A WITH(NOLOCK)
            LEFT JOIN Telecom.dbo.TAB_TELECOM_SCORE_NUMEROS NS WITH(NOLOCK) ON A.origem = NS.ORIGEM
            LEFT JOIN Telecom.dbo.dimqueues q WITH(NOLOCK) ON A.fila = q.queue_code AND A.id_servidor_callflex = q.dialer_server_id
            LEFT JOIN Telecom.dbo.dimcarteiras c WITH(NOLOCK) ON c.carteira_id = q.carteira_id
        WHERE 
            A.tipo = 'dis'
            AND c.responsible_executive = ?
            AND c.carteira_description = ?
        """
        params = [executivo, carteira]

        # Filtros Opcionais
        if fila:
            query += " AND q.queue_code = ?"
            params.append(fila)
        
        if mailing:
            query += " AND A.mailing = ?"
            params.append(mailing)

        # Filtro de Score (Lidando com o Score 5 que representa os NULLs também)
        if score:
            if str(score) == '5' or str(score) == '5.0':
                query += " AND ISNULL(NS.SCORE, 5.0) = 5.0"
            else:
                query += " AND NS.SCORE = ?"
                params.append(score)

        cursor.execute(query, params)
        columns = [column[0] for column in cursor.description]
        dados = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return jsonify(dados)

    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        conn.close()
# --- ROTA 3: CONSULTA DE SCORE POR LOTE (TXT OU ÚNICO) ---
@app.route('/api/consultar-score', methods=['POST'])
def consultar_score():
    # Como pode ser uma lista grande, usamos POST para receber no corpo da requisição
    dados_req = request.get_json()
    numeros = dados_req.get('numeros', [])

    if not numeros:
        return jsonify({"erro": "Nenhum número fornecido para consulta."}), 400

    # Limite de segurança: Evita que subam um TXT com 1 milhão de linhas e travem o banco
    if len(numeros) > 10000:
        return jsonify({"erro": "O limite máximo por consulta é de 10.000 números."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 1. Filtro de Segurança: Garante que a lista tem apenas números (evita SQL Injection)
        numeros_limpos = [str(n).strip() for n in numeros if str(n).strip().isdigit()]
        
        if not numeros_limpos:
            return jsonify({"erro": "O arquivo não contém números válidos."}), 400

        # 2. Vamos fatiar em lotes de 1000
        tamanho_lote = 1000
        dados = []
        
        for i in range(0, len(numeros_limpos), tamanho_lote):
            lote = numeros_limpos[i:i + tamanho_lote]
            
            # 3. Formata os números em texto puro separados por vírgula: 'num1','num2'
            lista_formatada = ",".join([f"'{n}'" for n in lote])
            
            query = f"""
            SELECT * FROM Telecom.dbo.TAB_TELECOM_SCORE_NUMEROS WITH(NOLOCK)
            WHERE ORIGEM IN ({lista_formatada})
            """
            
            # Como a string já está pronta, executamos a query direto (sem passar a variável 'lote')
            cursor.execute(query)
            columns = [column[0] for column in cursor.description]
            dados.extend([dict(zip(columns, row)) for row in cursor.fetchall()])
            
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        conn.close()

# ==========================================================
# ROTA 4: EXTRAÇÃO PARA TABELA DINÂMICA (EXCEL)
# ==========================================================
@app.route('/api/relatorio-esteira', methods=['GET'])
def relatorio_esteira():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Executa a sua Procedure exatamente como você fazia no banco
        cursor.execute("EXEC SP_CONSULTA_ESTEIRA_SCORE")
        columns = [column[0] for column in cursor.description]
        
        # --- CÓDIGO NOVO: Tratamento de Datas ---
        dados = []
        for row in cursor.fetchall():
            linha_dict = {}
            for idx, col_name in enumerate(columns):
                valor = row[idx]
                # Se o valor for uma data, converte para DD/MM/YYYY
                if isinstance(valor, (date, datetime)):
                    linha_dict[col_name] = valor.strftime('%d/%m/%Y')
                else:
                    linha_dict[col_name] = valor
            dados.append(linha_dict)
        # ----------------------------------------
        
        return jsonify(dados)
        
    except Exception as e:
        # Se der erro, manda para o log e devolve o erro
        logging.error(f"Erro na rota de relatorio_esteira: {e}")
        return jsonify({"erro": str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

# O APP.RUN DEVE FICAR SEMPRE AQUI NO FINAL DO ARQUIVO
if __name__ == '__main__':
    # Usando o motor robusto do próprio Flask para vermos os logs de erro na tela durante este teste
    print("Iniciando a API de Dados do Score na porta 5001 (Modo Nativo)...")
    app.run(host='0.0.0.0', port=5001, threaded=True)