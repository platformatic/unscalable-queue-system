/**
 * Message
 * A Message
 */
declare interface Message {
    id?: number;
    queueId: number;
    when: string;
    body?: string | null;
    headers?: {
        [name: string]: any;
    } | null;
    sentAt?: string | null;
    createdAt: string;
    updatedAt: string;
    failed: string;
    retries: number;
    cronId?: number | null;
}

export { Message };
