/* creates an items table */
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  queue_id INTEGER NOT NULL REFERENCES queues(id),
  "when" TIMESTAMP NOT NULL,
  /* add some validations, this should be an URL */
  callback_url VARCHAR(2048) NOT NULL,
  /* add some validations, this should be an enum */
  method VARCHAR(10) NOT NULL,
  body TEXT,
  headers JSON,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
