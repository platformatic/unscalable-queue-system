/**
 * Message
 * A Message
 */
declare interface Message {
    id?: number;
    body?: string | null;
    createdAt?: string | null;
    cronId?: number | null;
    failed: boolean;
    headers?: {
        [name: string]: any;
    } | null;
    queueId: number;
    retries: number;
    sentAt?: string | null;
    updatedAt?: string | null;
    when: string;
}
export { Message };
