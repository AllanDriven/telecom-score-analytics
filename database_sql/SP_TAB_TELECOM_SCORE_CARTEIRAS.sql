USE [Telecom]
GO
/****** Object:  StoredProcedure [dbo].[SP_TAB_TELECOM_SCORE_CARTEIRAS]    Script Date: 29/03/2026 14:42:17 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER   PROCEDURE [dbo].[SP_TAB_TELECOM_SCORE_CARTEIRAS]
    @DataExecucao DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @DataTraco VARCHAR(10);
    DECLARE @DataSemTraco VARCHAR(8);

    -- 1. Formata a data para o padrão 'YYYY-MM-DD' (usado no WHERE do DELETE)
    SET @DataTraco = CONVERT(VARCHAR(10), @DataExecucao, 120);
    
    -- 2. Formata a data para o padrão 'YYYYMMDD' (usado no sufixo da tabela do discador)
    SET @DataSemTraco = REPLACE(@DataTraco, '-', '');

    -- 3. Monta a query em SQL Dinâmico
    -- Atenção: as aspas simples do seu código original viram aspas duplas ('') dentro da string
    SET @SQL = N'
        -- Limpa os dados do dia executado OU dados mais antigos que 60 dias a partir de hoje
        DELETE FROM TAB_TELECOM_SCORE_CARTEIRAS
        WHERE DATE = ''' + @DataTraco + ''' 
           OR DATE < CAST(DATEADD(DAY, -60, GETDATE()) AS DATE);

        -- Insere os dados agregados da carteira
        INSERT INTO TAB_TELECOM_SCORE_CARTEIRAS
        SELECT
            CAST(A.Calldate as DATE) as DATE,
            Q.queue_id,
            M.mailingId,
            COUNT(*) AS TOTAL_DISCAGENS,
            SUM(CASE WHEN S.SCORE = 0 THEN 1 ELSE 0 END) AS SCORE_0,
            SUM(CASE WHEN S.SCORE = 1 THEN 1 ELSE 0 END) AS SCORE_1,
            SUM(CASE WHEN S.SCORE in (1.5, 1.6) THEN 1 ELSE 0 END) AS SCORE_1_5,
            SUM(CASE WHEN S.SCORE = 2 THEN 1 ELSE 0 END) AS SCORE_2,
            SUM(CASE WHEN S.SCORE = 3 THEN 1 ELSE 0 END) AS SCORE_3,
            SUM(CASE WHEN S.SCORE = 4 THEN 1 ELSE 0 END) AS SCORE_4,
            SUM(CASE WHEN S.SCORE = 5 OR S.SCORE IS NULL THEN 1 ELSE 0 END) AS SCORE_5,
			SUM(CASE WHEN S.SCORE = 0 THEN A.valor ELSE 0 END) AS CUSTO_SCORE_0,
            SUM(CASE WHEN S.SCORE = 1 THEN A.valor ELSE 0 END) AS CUSTO_SCORE_1,
            SUM(CASE WHEN S.SCORE in (1.5, 1.6) THEN A.valor ELSE 0 END) AS CUSTO_SCORE_1_5,
            SUM(CASE WHEN S.SCORE = 2 THEN A.valor ELSE 0 END) AS CUSTO_SCORE_2,
            SUM(CASE WHEN S.SCORE = 3 THEN A.valor ELSE 0 END) AS CUSTO_SCORE_3,
            SUM(CASE WHEN S.SCORE = 4 THEN A.valor ELSE 0 END) AS CUSTO_SCORE_4,
            SUM(CASE WHEN S.SCORE = 5 OR S.SCORE IS NULL THEN A.valor ELSE 0 END) AS CUSTO_SCORE_5
        FROM
            Atlas.dbo.tb_Dialer_Calls_' + @DataSemTraco + ' A with(nolock)
            LEFT JOIN Telecom.[dbo].[dimqueues] Q with(nolock)
                ON A.id_servidor_callflex = Q.dialer_server_id
                AND A.fila = Q.queue_code
            LEFT JOIN Telecom.dbo.TAB_TELECOM_SCORE_NUMEROS S with(nolock)
                ON A.origem = S.ORIGEM
            LEFT JOIN Telecom.dbo.dimesteiramailings M with(nolock)
                ON A.mailing = M.mailing
        WHERE
            A.tipo = ''dis''
        GROUP BY 
            CAST(A.Calldate as DATE),
            Q.queue_id,
            M.mailingId;
    ';

    -- Executa a string montada
    EXEC sp_executesql @SQL;

END;
