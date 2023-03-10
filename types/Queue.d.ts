/**
 * Queue
 * A Queue
 */
declare interface Queue {
    id?: number;
    name: string;
    createdAt: string;
    updatedAt: string;
    callbackUrl: string;
    method: string;
    headers?: {
        [name: string]: any;
    } | null;
    deadLetterQueueId?: number | null;
    maxRetries: number;
}

export { Queue };
