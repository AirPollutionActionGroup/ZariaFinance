-- Document types are known by id and name only — the code (PAN_CARD, …) goes.
-- Donors pointed at their ID document by that code; they now point at the
-- document type row by id. Every saved code has a master row, so nothing is lost.
ALTER TABLE donor_master ADD COLUMN document_type_id BIGINT REFERENCES document_type_master(id);

UPDATE donor_master d
SET document_type_id = t.id
FROM document_type_master t
WHERE d.document_type = t.code;

CREATE INDEX idx_donor_master_document_type ON donor_master(document_type_id);

ALTER TABLE donor_master DROP COLUMN document_type;
ALTER TABLE document_type_master DROP COLUMN code;
