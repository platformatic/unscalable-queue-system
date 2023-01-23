/* create crons table */
CREATE TABLE crons (
  id INTEGER PRIMARY KEY,
  queue_id INTEGER NOT NULL REFERENCES queues(id),

  schedule VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,

  /* these will be needed for creating the item */

  /* add some validations, this should be an URL */
  callback_url VARCHAR(2048) NOT NULL,
  /* add some validations, this should be an enum */
  method VARCHAR(10) NOT NULL,
  body TEXT,
  headers JSON
);

/* ADD cron_id field to items */
ALTER TABLE items ADD COLUMN cron_id INTEGER REFERENCES crons(id);
