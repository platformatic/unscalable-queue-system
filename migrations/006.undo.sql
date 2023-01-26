/* rename table messages to items */
ALTER TABLE messages RENAME TO items;

/* drop column callback_url from queue */
ALTER TABLE queues DROP COLUMN callback_url;
ALTER TABLE queues DROP COLUMN method;
ALTER TABLE queues DROP COLUMN headers;

ALTER TABLE items ADD COLUMN callback_url TEXT;
ALTER TABLE items ADD COLUMN method TEXT;

ALTER TABLE crons ADD COLUMN callback_url TEXT;
ALTER TABLE crons ADD COLUMN method TEXT;
