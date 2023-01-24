/**
 * Cron
 * A Cron
 */
declare interface Cron {
    id?: number;
    queueId: number;
    schedule: string;
    createdAt: string;
    updatedAt: string;
    callbackUrl: string;
    method: string;
    body?: string | null;
    headers?: {
        [name: string]: any;
    } | null;
}

export { Cron };
