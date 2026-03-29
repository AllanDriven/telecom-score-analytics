import pyodbc
import requests
import os
from datetime import date, timedelta
from dotenv import load_dotenv

# Carrega o .env da mesma pasta do script (padrão do projeto)
caminho_base = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(caminho_base, '.env'))

def get_db_connection():
    """Conexão padrão do projeto, lendo do .env."""
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={os.environ.get('DB_SERVER')};"
        f"DATABASE={os.environ.get('DB_DATABASE')};"
        f"UID={os.environ.get('DB_USER')};"
        f"PWD={os.environ.get('DB_PASSWORD')};"
    )
    return pyodbc.connect(conn_str)

def enviar_notificacao_teams(mensagem):
    webhook_url = os.environ.get('TEAMS_WEBHOOK_URL')
    if not webhook_url:
        print("Webhook URL não configurada. Pulando notificação.")
        return
    try:
        response = requests.post(webhook_url, json={"text": mensagem}, headers={'Content-Type': 'application/json'})
        response.raise_for_status()
        print("Notificação enviada ao Teams com sucesso.")
    except Exception as e:
        print(f"Erro ao enviar notificação para o Teams: {e}")

def main():
    status_final = "✅ Sucesso"
    qtd_discados = 0
    qtd_carteiras_v1 = 0
    qtd_carteiras_v2 = 0
    score_global_status = "Pendente"
    msg_erro = ""

    try:
        print("Conectando ao banco de dados...")
        conn = get_db_connection()
        cursor = conn.cursor()
        print("Banco de dados conectado.")

        hoje = date.today()
        dias_desejados = {hoje - timedelta(days=i) for i in range(1, 31)}

        # ==========================================================
        # LÓGICA DE DIAS FALTANTES - NÚMEROS DISCADOS
        # ==========================================================
        print("\nConsultando os dias já existentes na TAB_TELECOM_NUMEROS_DISCADOS...")
        cursor.execute("""
            SELECT DISTINCT [DATE] FROM dbo.TAB_TELECOM_NUMEROS_DISCADOS
            WHERE [DATE] >= CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
        """)
        dias_faltantes = sorted(list(dias_desejados - {row[0] for row in cursor.fetchall()}))
        qtd_discados = len(dias_faltantes)

        if not dias_faltantes:
            print("Nenhum dia faltante (Números Discados). Histórico em dia.")
        else:
            print(f"Encontrados {qtd_discados} dias faltantes. Processando Números Discados...")
            for dia in dias_faltantes:
                print(f"  → Processando: {dia}")
                cursor.execute("EXEC dbo.SP_TAB_TELECOM_NUMEROS_DISCADOS @DataExecucao = ?", dia)
                conn.commit()
            print("Números Discados: todos os dias foram importados com sucesso.")

        # ==========================================================
        # ATUALIZAÇÃO GLOBAL DE SCORES (COM TRAVA DE 60 MINUTOS)
        # ==========================================================
        print("\nVerificando a última execução de SP_TAB_TELECOM_SCORE_NUMEROS...")
        cursor.execute("""
            SELECT DATEDIFF(MINUTE, MAX(ULTIMA_EXECUCAO), GETDATE())
            FROM Telecom.dbo.EXECUCAO_PROCEDURES
            WHERE [PROCEDURE] = 'SP_TAB_TELECOM_SCORE_NUMEROS'
        """)
        row = cursor.fetchone()
        minutos_desde_ultima = row[0] if row and row[0] is not None else None

        if minutos_desde_ultima is not None and minutos_desde_ultima < 60:
            print(f"Última atualização foi há {minutos_desde_ultima} min. Pulando.")
            score_global_status = f"Pulado (há {minutos_desde_ultima} min)"
        else:
            print("Atualizando TAB_TELECOM_SCORE_NUMEROS...")
            cursor.execute("EXEC dbo.SP_TAB_TELECOM_SCORE_NUMEROS")
            conn.commit()
            score_global_status = "Atualizado"
            print("Score Global: atualizado com sucesso.")

        # ==========================================================
        # LÓGICA DE DIAS FALTANTES - SCORE CARTEIRAS V1
        # ==========================================================
        print("\nConsultando os dias já existentes na TAB_TELECOM_SCORE_CARTEIRAS (V1)...")
        cursor.execute("""
            SELECT DISTINCT [DATE] FROM dbo.TAB_TELECOM_SCORE_CARTEIRAS
            WHERE [DATE] >= CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
        """)
        dias_faltantes_v1 = sorted(list(dias_desejados - {row[0] for row in cursor.fetchall()}))
        qtd_carteiras_v1 = len(dias_faltantes_v1)

        if not dias_faltantes_v1:
            print("Nenhum dia faltante (Score Carteiras V1). Histórico em dia.")
        else:
            print(f"Encontrados {qtd_carteiras_v1} dias faltantes. Processando Score Carteiras V1...")
            for dia in dias_faltantes_v1:
                print(f"  → Processando V1: {dia}")
                cursor.execute("EXEC dbo.SP_TAB_TELECOM_SCORE_CARTEIRAS @DataExecucao = ?", dia)
                conn.commit()
            print("Score Carteiras V1: todos os dias foram importados com sucesso.")

        # ==========================================================
        # LÓGICA DE DIAS FALTANTES - SCORE CARTEIRAS V2 (NORMALIZADA)
        # ==========================================================
        print("\nConsultando os dias já existentes na TAB_TELECOM_SCORE_CARTEIRAS_V2...")
        cursor.execute("""
            SELECT DISTINCT [DATE] FROM dbo.TAB_TELECOM_SCORE_CARTEIRAS_V2
            WHERE [DATE] >= CAST(DATEADD(DAY, -30, GETDATE()) AS DATE)
        """)
        dias_faltantes_v2 = sorted(list(dias_desejados - {row[0] for row in cursor.fetchall()}))
        qtd_carteiras_v2 = len(dias_faltantes_v2)

        if not dias_faltantes_v2:
            print("Nenhum dia faltante (Score Carteiras V2). Histórico em dia.")
        else:
            print(f"Encontrados {qtd_carteiras_v2} dias faltantes. Processando Score Carteiras V2...")
            for dia in dias_faltantes_v2:
                print(f"  → Processando V2: {dia}")
                cursor.execute("EXEC dbo.SP_TAB_TELECOM_SCORE_CARTEIRAS_V2 @DataExecucao = ?", dia)
                conn.commit()
            print("Score Carteiras V2: todos os dias foram importados com sucesso.")

        print("\nRotina finalizada com sucesso!")

    except Exception as e:
        status_final = "❌ Erro"
        msg_erro = str(e)
        print(f"\nOcorreu um erro durante a execução: {e}")
        if 'conn' in locals():
            conn.rollback()

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

        # ==========================================================
        # ENVIO DA NOTIFICAÇÃO PARA O TEAMS
        # ==========================================================
        resumo_texto = (
            f"**Resumo da Rotina de Score (Telecom)**\n\n"
            f"**Status:** {status_final}\n\n"
            f"**Detalhes da Execução:**\n"
            f"- **Números Discados:** {qtd_discados} dias processados/atualizados.\n"
            f"- **Score Global (Números):** {score_global_status}.\n"
            f"- **Score Carteiras V1:** {qtd_carteiras_v1} dias processados/atualizados.\n"
            f"- **Score Carteiras V2:** {qtd_carteiras_v2} dias processados/atualizados.\n"
        )
        if msg_erro:
            resumo_texto += f"\n**Log de Erro:**\n`{msg_erro}`"

        enviar_notificacao_teams(resumo_texto)

if __name__ == "__main__":
    main()