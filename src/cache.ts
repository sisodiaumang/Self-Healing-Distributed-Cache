class CacheNode {

    key: string;
    value: string;
    expiresAt: number | null;
    prev: CacheNode | null;
    next: CacheNode | null;

    constructor(
        key: string,
        value: string,
        expiresAt: number | null
    ) {
        this.key = key;
        this.value = value;
        this.expiresAt = expiresAt;

        this.prev = null;
        this.next = null;
    }
}

export class Cache {
    private capacity: number;
    private store: Map<string, CacheNode>;
    private hits: number = 0;
    private misses: number = 0;
    private evictions: number = 0;
    private head: CacheNode | null;
    private tail: CacheNode | null;

    constructor(capacity: number = 100) {
        this.store = new Map();
        this.capacity = capacity;
        this.head = null;
        this.tail = null;
    }

    private addToFront(node: CacheNode): void {
        if (this.head === null) {
            this.head = node;
            this.tail = node;
            return;
        }

        node.prev = null;
        node.next = this.head;

        this.head.prev = node;
        this.head = node;
    }

    private removeNode(node: CacheNode): void {
        const prevNode = node.prev;
        const nextNode = node.next;

        if (prevNode) {
            prevNode.next = nextNode;
        } else {
            this.head = nextNode;
        }

        if (nextNode) {
            nextNode.prev = prevNode;
        } else {
            this.tail = prevNode;
        }

        node.prev = null;
        node.next = null;
    }

    private moveToFront(node: CacheNode): void {
        if (node === this.head) {
            return;
        }

        this.removeNode(node);
        this.addToFront(node);
    }

    set(key: string, value: string, ttl?: number): void {
        const expiresAt =
            ttl !== undefined
                ? Date.now() + ttl
                : null;
        const existing = this.store.get(key);
        if (existing) {
            existing.value = value;
            existing.expiresAt = expiresAt;
            this.moveToFront(existing);
            return;
        }
        const node = new CacheNode(
            key,
            value,
            expiresAt
        );

        this.store.set(key, node);
        this.addToFront(node);
        if (this.store.size > this.capacity) {
            this.removeLRU();
        }
    }

    get(key: string): string | undefined {

        const entry = this.store.get(key);

        if (!entry) {
            this.misses++;
            return undefined;
        }

        if (
            entry.expiresAt !== null &&
            entry.expiresAt <= Date.now()
        ) {

            this.store.delete(key);

            this.removeNode(entry);

            this.misses++;

            return undefined;
        }

        this.hits++;

        this.moveToFront(entry);

        return entry.value;
    }
    delete(key: string): boolean {
        const node = this.store.get(key);

        if (!node) {
            return false;
        }

        this.store.delete(key);
        this.removeNode(node);

        return true;
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    size(): number {
        return this.store.size;
    }
    private removeLRU(): void {

        if (this.tail === null) return;

        const lruNode =
            this.tail;

        this.store.delete(
            lruNode.key
        );

        this.removeNode(
            lruNode
        );

        this.evictions++;
    }
    getEntries(): { key: string; value: string; ttl?: number }[] {
        const entries: { key: string; value: string; ttl?: number }[] = [];

        for (const [key, node] of this.store) {
            if (node.expiresAt !== null) {
                const ttl = node.expiresAt - Date.now();

                if (ttl <= 0) {
                    continue;
                }

                entries.push({
                    key,
                    value: node.value,
                    ttl
                });
            } else {
                entries.push({
                    key,
                    value: node.value
                });
            }
        }

        return entries;
    }
    getStats() {

        return {
            size: this.store.size,
            hits: this.hits,
            misses: this.misses,
            evictions: this.evictions
        };

    }
}