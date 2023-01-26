/* rename table items to messages */
ALTER TABLE items RENAME TO messages;

/* add callback_url column to queue */
ALTER TABLE queues ADD COLUMN callback_url TEXT NOT NULL;
ALTER TABLE queues ADD COLUMN method TEXT NOT NULL;
ALTER TABLE queues ADD COLUMN headers JSON;

/* drop column callback_url from message */
ALTER TABLE messages DROP COLUMN callback_url;
ALTER TABLE messages DROP COLUMN method;

/* drop column callback_url from message */
ALTER TABLE crons DROP COLUMN callback_url;
ALTER TABLE crons DROP COLUMN method;
