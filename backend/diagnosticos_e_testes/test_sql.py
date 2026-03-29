import sys
import os
import pyodbc

caminho_base = os.path.dirname(os.path.abspath(__file__))
sys.path.append(caminho_base)

from API_dados_score import get_db_connection

def find_table():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        # Pega a lista de todos os databases
        c.execute("SELECT name FROM master.dbo.sysdatabases")
        dbs = [row[0] for row in c.fetchall()]
        
        found = False
        for db in dbs:
            try:
                query = f"SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME FROM [{db}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%SCORE_CARTEIRAS_V2%'"
                c.execute(query)
                for row in c.fetchall():
                    print(f"ACHEI A TABELA EM: Banco [{row[0]}], Esquema [{row[1]}], Nome [{row[2]}]")
                    found = True
            except Exception as e:
                pass
                
        if not found:
            print("TABELA NAO ENCONTRADA EM NENHUM BANCO DE DADOS!")
            
    except Exception as e:
        print(f"Erro na conexão global: {e}")

if __name__ == '__main__':
    find_table()
