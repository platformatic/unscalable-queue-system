/**
 * Item
 * A Item
 */
declare interface Item {
    id?: number;
    queueId: number;
    when: string;
    callbackUrl: string;
    method: string;
    body?: string | null;
    headers?: string | null;
    sentAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export { Item };
