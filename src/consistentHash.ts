export class ConsistentHashRing {
    private ring: Map<number, string>;
    private nodes: string[];
    private virtualNodes: number;

    constructor(
        nodes: string[] = [],
        virtualNodes: number = 100
    ) {
        this.ring = new Map();
        this.nodes = [];
        this.virtualNodes = virtualNodes;

        for (const node of nodes) {
            this.addNode(node);
        }
    }

    private hash(key: string): number {
        let hash = 2166136261;

        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    }

    addNode(node: string): void {
        if (this.nodes.includes(node)) {
            return;
        }

        this.nodes.push(node);

        for (let i = 0; i < this.virtualNodes; i++) {
            const virtualNode = `${node}#${i}`;
            const hash = this.hash(virtualNode);

            this.ring.set(hash, node);
        }
    }

    removeNode(node: string): void {
        if (!this.nodes.includes(node)) {
            return;
        }

        for (let i = 0; i < this.virtualNodes; i++) {
            const virtualNode = `${node}#${i}`;
            const hash = this.hash(virtualNode);

            this.ring.delete(hash);
        }

        this.nodes = this.nodes.filter(
            existingNode => existingNode !== node
        );
    }

    getNode(key: string): string | undefined {
        const nodes = this.getNodes(key, 1);

        return nodes[0];
    }

    getNodes(
        key: string,
        count: number
    ): string[] {
        if (this.ring.size === 0 || count <= 0) {
            return [];
        }

        const keyHash = this.hash(key);

        const sortedHashes = Array.from(
            this.ring.keys()
        ).sort((a, b) => a - b);

        // Find first position clockwise from key
        let startIndex = 0;

        for (let i = 0; i < sortedHashes.length; i++) {
            if (sortedHashes[i] >= keyHash) {
                startIndex = i;
                break;
            }

            // If key is larger than every hash,
            // wrap around to the beginning.
            startIndex = 0;
        }

        const result: string[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < sortedHashes.length; i++) {
            const index =
                (startIndex + i) % sortedHashes.length;

            const node = this.ring.get(
                sortedHashes[index]
            );

            if (!node || seen.has(node)) {
                continue;
            }

            seen.add(node);
            result.push(node);

            if (result.length === count) {
                break;
            }
        }

        return result;
    }

    getNodesList(): string[] {
        return [...this.nodes];
    }

    getRing(): Map<number, string> {
        return new Map(this.ring);
    }
}