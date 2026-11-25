-- Geographies can name cities, not just states. A row with only a state means
-- the whole state; a row with a city means just that city (in that state).
ALTER TABLE spendable_geography
    ADD COLUMN city_id BIGINT;

ALTER TABLE spendable_geography
    ADD CONSTRAINT fk_geo_city FOREIGN KEY (city_id) REFERENCES city_master (id);

CREATE INDEX idx_geo_city_id ON spendable_geography (city_id);

-- One row per state used to be the rule; a state can now hold several cities.
-- Keep it unique per kind: one whole-state row per state, each city once.
ALTER TABLE spendable_geography DROP CONSTRAINT uq_geo_profile_state;

CREATE UNIQUE INDEX uq_geo_profile_whole_state
    ON spendable_geography (fund_profile_id, state_id) WHERE city_id IS NULL;

CREATE UNIQUE INDEX uq_geo_profile_city
    ON spendable_geography (fund_profile_id, city_id) WHERE city_id IS NOT NULL;
