/* add retries column to table items */
ALTER TABLE items ADD COLUMN retries INTEGER NOT NULL DEFAULT 0;
