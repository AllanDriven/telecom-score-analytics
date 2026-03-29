import sys
import os

caminho_base = os.path.dirname(os.path.abspath(__file__))
sys.path.append(caminho_base)
from API_dados_score import get_db_connection

def db_search():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        c.execute("SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'TAB_TELECOM%'")
        rows = c.fetchall()
        
        with open('tabelas_finais.txt', 'w') as f:
            for r in rows:
                f.write(str(r) + '\n')
                
    except Exception as e:
        print("Exception:", e)

if __name__ == '__main__':
    db_search()
