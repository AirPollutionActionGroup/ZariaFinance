-- V142: Grant agreement numbers move to the app-wide code style, by financial year:
--         ZRY/GA/2026/021  →  GA-2026-27-021
--       (FY = the Indian April–March year of the agreement date). Numbers are kept
--       where they can be; the old code stays in legacy_code so signed paper and
--       searches still match. New numbers come from document_sequence (one locked
--       row per type and year) instead of "highest existing + 1".

ALTER TABLE grant_agreement ALTER COLUMN grant_code TYPE VARCHAR(40);
ALTER TABLE grant_agreement ADD COLUMN legacy_code VARCHAR(40);

CREATE TABLE document_sequence (
    doc_type VARCHAR(30) NOT NULL,  -- GRANT, …
    period   VARCHAR(10) NOT NULL,  -- "2026-27"
    last_no  INT         NOT NULL,
    CONSTRAINT pk_document_sequence PRIMARY KEY (doc_type, period),
    CONSTRAINT ck_document_sequence_last_no CHECK (last_no >= 0)
);

-- Convert every ZRY/GA/YYYY/NNN… code. Within a financial year the first agreement
-- holding a number keeps it (plain codes before suffixed ones like "001-B");
-- any other agreement gets the next free number in that year.
WITH src AS (
    SELECT id,
           grant_code,
           CASE WHEN EXTRACT(MONTH FROM agreement_date) >= 4
                THEN EXTRACT(YEAR FROM agreement_date)::int
                ELSE EXTRACT(YEAR FROM agreement_date)::int - 1 END AS fy_start,
           NULLIF(substring(grant_code FROM '^ZRY/GA/[0-9]{4}/([0-9]+)'), '')::int AS n,
           grant_code ~ '^ZRY/GA/[0-9]{4}/[0-9]+$' AS plain
    FROM grant_agreement
    WHERE grant_code LIKE 'ZRY/GA/%'
),
ranked AS (
    SELECT src.*,
           CASE WHEN n IS NULL THEN 2
                ELSE row_number() OVER (PARTITION BY fy_start, n ORDER BY plain DESC, id) END AS dup
    FROM src
),
keepers AS (
    SELECT fy_start, COALESCE(MAX(n) FILTER (WHERE dup = 1), 0) AS max_n
    FROM ranked
    GROUP BY fy_start
),
numbered AS (
    SELECT r.id,
           r.grant_code,
           r.fy_start,
           CASE WHEN r.dup = 1 THEN r.n
                ELSE k.max_n + row_number() OVER (PARTITION BY r.fy_start, (r.dup = 1) ORDER BY r.id) END AS new_n
    FROM ranked r
    JOIN keepers k ON k.fy_start = r.fy_start
)
UPDATE grant_agreement g
SET legacy_code = n.grant_code,
    grant_code  = 'GA-' || n.fy_start || '-' || lpad(((n.fy_start + 1) % 100)::text, 2, '0')
                  || '-' || lpad(n.new_n::text, 3, '0')
FROM numbered n
WHERE g.id = n.id;

-- Start each year's sequence after the highest number now in use.
INSERT INTO document_sequence (doc_type, period, last_no)
SELECT 'GRANT',
       substring(grant_code FROM '^GA-([0-9]{4}-[0-9]{2})-[0-9]+$'),
       MAX(substring(grant_code FROM '^GA-[0-9]{4}-[0-9]{2}-([0-9]+)$')::int)
FROM grant_agreement
WHERE grant_code ~ '^GA-[0-9]{4}-[0-9]{2}-[0-9]+$'
GROUP BY 2;

CREATE INDEX idx_grant_agreement_legacy_code ON grant_agreement (legacy_code) WHERE legacy_code IS NOT NULL;
