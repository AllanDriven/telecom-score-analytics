import sys, os
caminho_base = os.path.dirname(os.path.abspath(__file__))
sys.path.append(caminho_base)
from API_dados_score import get_db_connection

conn = get_db_connection()
c = conn.cursor()

print("=== PERMISSOES DO USUARIO ATUAL ===")
c.execute("SELECT CURRENT_USER, USER_NAME(), SUSER_SNAME()")
print(c.fetchone())

print("\n=== PERMISSOES DIRETAS NA V2 ===")
c.execute("""
    SELECT HAS_PERMS_BY_NAME('dbo.TAB_TELECOM_SCORE_CARTEIRAS_V2', 'OBJECT', 'SELECT') as pode_select,
           HAS_PERMS_BY_NAME('dbo.TAB_TELECOM_SCORE_CARTEIRAS_V2', 'OBJECT', 'INSERT') as pode_insert,
           HAS_PERMS_BY_NAME('dbo.TAB_TELECOM_SCORE_CARTEIRAS', 'OBJECT', 'SELECT') as pode_v1_select
""")
print(c.fetchone())

print("\n=== TENTAR SELECT DIRETO NA V2 ===")
try:
    c.execute("SELECT TOP 1 * FROM TAB_TELECOM_SCORE_CARTEIRAS_V2 WITH(NOLOCK)")
    print("SUCESSO! Colunas:", [d[0] for d in c.description])
    print("Dados:", c.fetchone())
except Exception as e:
    print("ERRO:", e)

conn.close()
