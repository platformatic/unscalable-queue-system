/* remove column max_retries from table queues */
ALTER TABLE queues DROP COLUMN max_retries;

/* remove column dead_letter_queue_id from table queues */
ALTER TABLE queues DROP COLUMN dead_letter_queue_id;
