import sys
import os

caminho_base = os.path.dirname(os.path.abspath(__file__))
sys.path.append(caminho_base)
from API_dados_score import get_db_connection

def db_search():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SET LOCK_TIMEOUT 1000") # Não trave em cadeado
        
        c.execute("SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'TAB_TELECOM_SCORE%'")
        rows = c.fetchall()
        print("Tabelas Telecom Atuais no Banco do .env:", rows)
        
        # Agora procurar em Atlas
        c.execute("SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME FROM Atlas.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'TAB_TELECOM_SCORE%'")
        rows2 = c.fetchall()
        print("Tabelas no banco Atlas:", rows2)

    except Exception as e:
        print("Exception:", e)

if __name__ == '__main__':
    db_search()
