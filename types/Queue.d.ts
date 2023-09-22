/**
 * Queue
 * A Queue
 */
declare interface Queue {
    id?: number;
    callbackUrl: string;
    createdAt?: string | null;
    deadLetterQueueId?: number | null;
    headers?: {
        [name: string]: any;
    } | null;
    maxRetries: number;
    method: string;
    name: string;
    updatedAt?: string | null;
}
export { Queue };
