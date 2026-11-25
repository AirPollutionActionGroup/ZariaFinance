-- V141: A budget can also be planned for a single Project (a programme row with
--       type = 'Project'), alongside Programme and Organisation budgets.
--       Programme and Project budgets both need their programme_id.

ALTER TABLE budget DROP CONSTRAINT ck_budget_type;
ALTER TABLE budget ADD CONSTRAINT ck_budget_type
    CHECK (budget_type IN ('PROGRAMME', 'PROJECT', 'ORGANISATION'));

ALTER TABLE budget DROP CONSTRAINT ck_budget_programme;
ALTER TABLE budget ADD CONSTRAINT ck_budget_programme
    CHECK (budget_type = 'ORGANISATION' OR programme_id IS NOT NULL);
