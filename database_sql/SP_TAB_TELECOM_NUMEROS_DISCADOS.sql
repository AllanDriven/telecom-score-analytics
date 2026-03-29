USE [Telecom]
GO

/****** Object:  StoredProcedure [dbo].[SP_TAB_TELECOM_NUMEROS_DISCADOS]    Script Date: 04/03/2026 13:25:44 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


ALTER PROCEDURE [dbo].[SP_TAB_TELECOM_NUMEROS_DISCADOS]
    @DataExecucao DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @DataTraco VARCHAR(10);
    DECLARE @DataSemTraco VARCHAR(8);

    -- Formata a data para o padrão 'YYYY-MM-DD' (usado no WHERE do DELETE)
    SET @DataTraco = CONVERT(VARCHAR(10), @DataExecucao, 120);
    
    -- Formata a data para o padrão 'YYYYMMDD' (usado no sufixo da tabela)
    SET @DataSemTraco = REPLACE(@DataTraco, '-', '');

    -- Monta a query em SQL Dinâmico
    -- Atenção: as aspas simples originais precisam ser duplicadas ('') dentro da string
    SET @SQL = N'
        -- Deleta os dados do dia que será processado OU dados mais antigos que 30 dias a partir de HOJE
        DELETE TAB_TELECOM_NUMEROS_DISCADOS
        WHERE DATE = ''' + @DataTraco + ''' 
           OR DATE < CAST(DATEADD(DAY, -60, GETDATE()) AS DATE);

        -- Insere os novos dados da tabela diária
        INSERT INTO TAB_TELECOM_NUMEROS_DISCADOS
        SELECT
            cast(Calldate as date) as DATE,
            ORIGEM,
            COUNT(*) as DISPAROS,
            SUM(CASE 
                WHEN isdncause = 1 
                    then 1 
                    else 0 
                END) as ISDN1,
            SUM(CASE 
                WHEN status = ''answered'' 
                    THEN 1
                    ELSE 0
                END) as CONECTADAS,
            SUM(CASE 
                WHEN status <> ''answered'' 
                    THEN 1
                    ELSE 0
                END) as INSUCESSOS,
            SUM(CASE 
                WHEN agente <> 0 OR isdncause = 131
                    THEN 1
                    ELSE 0
                END) as ALO
        FROM Atlas.dbo.tb_Dialer_Calls_' + @DataSemTraco + '
        WHERE
            tipo = ''dis''
            AND terminator <> ''''
        GROUP BY 
            cast(Calldate as date),
            ORIGEM;
    ';

    -- Opcional: Descomente a linha abaixo se quiser debugar e ver a query impressa antes de rodar
    -- PRINT @SQL;

    -- Executa a string montada
    EXEC sp_executesql @SQL;

END;
GO

