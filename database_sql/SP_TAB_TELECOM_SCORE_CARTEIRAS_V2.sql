USE [Telecom]
GO
/****** Object:  StoredProcedure [dbo].[SP_TAB_TELECOM_SCORE_CARTEIRAS_V2] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[SP_TAB_TELECOM_SCORE_CARTEIRAS_V2]
    @DataExecucao DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @DataTraco VARCHAR(10);
    DECLARE @DataSemTraco VARCHAR(8);

    -- 1. Formata a data para os padrões necessários
    SET @DataTraco = CONVERT(VARCHAR(10), @DataExecucao, 120);
    SET @DataSemTraco = REPLACE(@DataTraco, '-', '');

    -- 2. Monta a query em SQL Dinâmico Normalizado
    SET @SQL = N'
        BEGIN TRY
            BEGIN TRANSACTION;

            -- Limpa os dados do dia executado OU dados mais antigos que 60 dias (APONTANDO PARA O DBO)
            DELETE FROM dbo.TAB_TELECOM_SCORE_CARTEIRAS_V2
            WHERE DATE = ''' + @DataTraco + ''' 
               OR DATE < CAST(DATEADD(DAY, -60, GETDATE()) AS DATE);

            -- Insere os dados agrupados por FILA, MAILING e SCORE (APONTANDO PARA O DBO)
            INSERT INTO dbo.TAB_TELECOM_SCORE_CARTEIRAS_V2
            SELECT
                CAST(A.Calldate as DATE) as DATE,
                Q.queue_id,
                M.mailingId,
                -- Se a ligação não tem score (NULL), assume 5.0 como padrão
                ISNULL(CAST(S.SCORE AS DECIMAL(5,1)), 5.0) AS SCORE_VALOR, 
                COUNT(*) AS VOLUME_DISCAGENS,
                SUM(A.valor) AS CUSTO_TOTAL
            FROM
                Atlas.dbo.tb_Dialer_Calls_' + @DataSemTraco + ' A with(nolock)
                LEFT JOIN Telecom.dbo.dimqueues Q with(nolock)
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
                M.mailingId,
                ISNULL(CAST(S.SCORE AS DECIMAL(5,1)), 5.0);

            COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0
                ROLLBACK TRANSACTION;
            
            -- Retorna o erro exato caso a tabela de origem não exista ou dê outro problema
            DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
            RAISERROR(@ErrorMessage, 16, 1);
        END CATCH
    ';

    EXEC sp_executesql @SQL;

END;