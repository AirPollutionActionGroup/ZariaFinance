-- Document types a donor type must give: when a donor of one of these donor
-- types is saved, its ID document is required and must be one of the document
-- types marked for that donor type. Empty for every type to start with, so
-- nothing changes for existing donors until finance marks some.
CREATE TABLE document_type_master_required_donor_type (
    document_type_id BIGINT NOT NULL REFERENCES document_type_master(id) ON DELETE CASCADE,
    donor_type_id    BIGINT NOT NULL REFERENCES donor_type_master(id) ON DELETE CASCADE,
    PRIMARY KEY (document_type_id, donor_type_id)
);

CREATE INDEX idx_document_type_required_donor_type ON document_type_master_required_donor_type(donor_type_id);
