-- Document types are offered by fund source domicile again — now mandatory:
-- every type is for Domestic donors, Foreign donors, or both (at least one row).
CREATE TABLE document_type_master_fund_source_domicile (
    document_type_id     BIGINT      NOT NULL REFERENCES document_type_master(id) ON DELETE CASCADE,
    fund_source_domicile VARCHAR(20) NOT NULL,
    PRIMARY KEY (document_type_id, fund_source_domicile),
    CONSTRAINT chk_document_type_domicile CHECK (fund_source_domicile IN ('DOMESTIC', 'FOREIGN'))
);

-- Starting values (the original defaults): Indian IDs for domestic donors, the
-- foreign tax ID for foreign donors, everything else for both.
INSERT INTO document_type_master_fund_source_domicile (document_type_id, fund_source_domicile)
SELECT id, 'DOMESTIC' FROM document_type_master
WHERE LOWER(name) IN ('pan card', 'aadhaar card', 'voter id', 'driving license');

INSERT INTO document_type_master_fund_source_domicile (document_type_id, fund_source_domicile)
SELECT id, 'FOREIGN' FROM document_type_master
WHERE LOWER(name) = 'foreign tax identification number';

INSERT INTO document_type_master_fund_source_domicile (document_type_id, fund_source_domicile)
SELECT t.id, d.domicile
FROM document_type_master t
CROSS JOIN (VALUES ('DOMESTIC'), ('FOREIGN')) AS d(domicile)
WHERE NOT EXISTS (SELECT 1 FROM document_type_master_fund_source_domicile x WHERE x.document_type_id = t.id);
