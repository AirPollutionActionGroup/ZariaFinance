-- A donor can have several points of contact (name, email, phone), one of
-- them primary. The donor_contact table from V3 was never used (no rows): it
-- is reshaped to that, the single SPOC on donor_master is copied in as each
-- donor's primary contact, and the SPOC columns are dropped.

ALTER TABLE donor_contact
    DROP COLUMN contact_title,
    DROP COLUMN mobile_number,
    DROP COLUMN address,
    DROP COLUMN city_id,
    DROP COLUMN state_id,
    DROP COLUMN postal_code,
    DROP COLUMN contact_type;

ALTER TABLE donor_contact
    ALTER COLUMN phone_number TYPE VARCHAR(30),
    ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

-- Each donor's current SPOC becomes its primary contact.
INSERT INTO donor_contact (donor_id, contact_name, email, phone_number, is_primary, sort_order,
                           created_at, updated_at, created_by, updated_by)
SELECT id,
       spoc_name_of_the_person,
       spoc_email,
       LEFT(NULLIF(TRIM(spoc_phone_number), ''), 30),
       TRUE,
       0,
       COALESCE(created_at, CURRENT_TIMESTAMP),
       COALESCE(updated_at, CURRENT_TIMESTAMP),
       created_by,
       updated_by
FROM donor_master;

UPDATE donor_contact SET is_primary = FALSE WHERE is_primary IS NULL;
ALTER TABLE donor_contact
    ALTER COLUMN is_primary SET NOT NULL,
    ALTER COLUMN email SET NOT NULL;

-- One primary per donor; an email appears once per donor.
CREATE UNIQUE INDEX ux_donor_contact_primary ON donor_contact (donor_id) WHERE is_primary;
CREATE UNIQUE INDEX ux_donor_contact_email ON donor_contact (donor_id, LOWER(email));

ALTER TABLE donor_master
    DROP COLUMN spoc_name_of_the_person,
    DROP COLUMN spoc_phone_number,
    DROP COLUMN spoc_email;
