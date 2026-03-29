USE [Telecom]
GO

/****** Object:  StoredProcedure [dbo].[SP_TAB_TELECOM_SCORE_NUMEROS]    Script Date: 04/03/2026 13:26:20 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


ALTER   PROCEDURE [dbo].[SP_TAB_TELECOM_SCORE_NUMEROS]
AS
BEGIN
    SET NOCOUNT ON;

    -- Limpa todos os dados antigos da tabela alvo
    TRUNCATE TABLE telecom.dbo.TAB_TELECOM_SCORE_NUMEROS;

    -- Seu código original inicia aqui:
    WITH Agrupado AS (
        -- 1. Agrupa todo o histórico da tabela por número
        SELECT 
            ORIGEM,
            SUM(DISPAROS) AS TOTAL_DISPAROS,
            SUM(ISDN1) AS TOTAL_ISDN1,
            SUM(ALO) AS TOTAL_ALO
        FROM 
            telecom.dbo.TAB_TELECOM_NUMEROS_DISCADOS
        GROUP BY 
            ORIGEM
    ),
    Calculado AS (
        -- 2. Calcula as taxas e extrai metadados do número para as regras
        SELECT
            ORIGEM,
            TOTAL_DISPAROS,
            TOTAL_ISDN1,
            TOTAL_ALO,
            -- Conversão para float para calcular porcentagem de forma segura (evitando divisão por zero)
            CAST(TOTAL_ISDN1 AS FLOAT) / NULLIF(TOTAL_DISPAROS, 0) AS TAXA_ISDN1,
            CAST(TOTAL_ALO AS FLOAT) / NULLIF(TOTAL_DISPAROS, 0) AS TAXA_ALO,
            LEN(ORIGEM) AS TAMANHO_NUMERO,
            SUBSTRING(ORIGEM, 1, 2) AS DDD
        FROM 
            Agrupado
    )
    -- 3. Avalia os scores e retorna o top 1000
    INSERT INTO telecom.dbo.TAB_TELECOM_SCORE_NUMEROS
    SELECT
        ORIGEM,
        CAST(
            CASE 
                -- SCORE 0: Número inválido (Tamanho incorreto ou DDD Inexistente)
                WHEN TOTAL_DISPAROS >= 20 AND (
                     TAMANHO_NUMERO < 10 
                     OR TAMANHO_NUMERO > 11 
                     OR DDD NOT IN (
                        '11','12','13','14','15','16','17','18','19', -- SP
                        '21','22','24','27','28',                     -- RJ / ES
                        '31','32','33','34','35','37','38',           -- MG
                        '41','42','43','44','45','46','47','48','49', -- PR / SC
                        '51','53','54','55',                          -- RS
                        '61','62','63','64','65','66','67','68','69', -- DF / Centro-Oeste / Norte
                        '71','73','74','75','77','79',                -- BA / SE
                        '81','82','83','84','85','86','87','88','89', -- NE
                        '91','92','93','94','95','96','97','98','99'  -- Norte / MA
                     )
                ) THEN 0.0
                
                -- SCORE 1: ISDN 1 em mais de 90% (> 0.90) e Nenhum alô
                WHEN TOTAL_DISPAROS >= 20 AND TAXA_ISDN1 > 0.90 AND TOTAL_ALO = 0 THEN 1.0
                
                -- SCORE 1.5: ISDN 1 em exatamente 90% (>= 0.90) e Nenhum alô
                -- Obs: A condição "> 90%" já foi capturada pela linha acima.
                WHEN TOTAL_DISPAROS >= 20 AND TAXA_ISDN1 <= 0.90 AND TOTAL_ALO = 0 THEN 1.5
                
                -- SCORE 5: Menos de 20 chamadas OU Taxa de alô maior que 20%
                WHEN TOTAL_DISPAROS < 20 OR TAXA_ALO > 0.20 THEN 5.0
                
                -- SCORE 2: Taxa de alo de até 5% (0% a 5%)
                WHEN TOTAL_DISPAROS >= 20 AND TAXA_ALO <= 0.05 THEN 2.0
                
                -- SCORE 3: Taxa de alo de 5% a 10% (0.05 a 0.10)
                WHEN TOTAL_DISPAROS >= 20 AND TAXA_ALO > 0.05 AND TAXA_ALO <= 0.10 THEN 3.0
                
                -- SCORE 4: Taxa de alo de 10% a 20% (0.10 a 0.20)
                WHEN TOTAL_DISPAROS >= 20 AND TAXA_ALO > 0.10 AND TAXA_ALO <= 0.20 THEN 4.0
                
                -- Fallback por segurança
                ELSE 5.0 
            END AS DECIMAL(3,1)
        ) AS SCORE 
    FROM 
        Calculado;

	INSERT INTO telecom.dbo.EXECUCAO_PROCEDURES
	SELECT
		'SP_TAB_TELECOM_SCORE_NUMEROS' as "PROCEDURE",
		GETDATE() as ULTIMA_EXECUCAO


END;
GO

