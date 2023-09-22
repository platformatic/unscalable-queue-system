/**
 * Cron
 * A Cron
 */
declare interface Cron {
    id?: number;
    body?: string | null;
    createdAt?: string | null;
    headers?: {
        [name: string]: any;
    } | null;
    queueId: number;
    schedule: string;
    updatedAt?: string | null;
}
export { Cron };
