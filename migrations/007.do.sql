/* add column dead_letter_queue_id to table queues */
ALTER TABLE queues ADD COLUMN dead_letter_queue_id INTEGER REFERENCES queues(id) ON DELETE SET NULL;

/* add column max_retries to table queues */
ALTER TABLE queues ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 5;
