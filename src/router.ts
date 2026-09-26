import { ConsistentHashRing } from "./consistentHash";

export class CacheRouter {
    private ring: ConsistentHashRing;

    // Every node the router knows about
    private knownNodes: Set<string>;

    // Nodes currently healthy and present in the hash ring
    private activeNodes: Set<string>;

    private replicationFactor: number;

    private healthCheckInterval:
        ReturnType<typeof setInterval> | null;

    constructor(
        nodes: string[],
        replicationFactor: number = 2
    ) {
        this.knownNodes = new Set(nodes);
        this.activeNodes = new Set(nodes);

        this.ring = new ConsistentHashRing(nodes);

        this.replicationFactor = replicationFactor;

        this.healthCheckInterval = null;
    }

    // ========================================
    // NODE MANAGEMENT
    // ========================================

    getNode(key: string): string | undefined {
        return this.ring.getNode(key);
    }

    addNode(node: string): void {
        // Already active
        if (this.activeNodes.has(node)) {
            return;
        }

        // Remember this node permanently
        this.knownNodes.add(node);

        // Mark as active
        this.activeNodes.add(node);

        // Add to hash ring
        this.ring.addNode(node);

        console.log(`${node} added back to hash ring`);
    }

    removeNode(node: string): void {
        if (!this.activeNodes.has(node)) {
            return;
        }

        // IMPORTANT:
        // We DON'T remove it from knownNodes.
        // This allows us to detect recovery later.
        this.activeNodes.delete(node);

        // Remove from hash ring
        this.ring.removeNode(node);

        console.log(`${node} removed from hash ring`);
    }

    // ========================================
    // SET
    // ========================================

    async set(
        key: string,
        value: string,
        ttl?: number
    ): Promise<void> {

        const nodes = this.ring.getNodes(
            key,
            this.replicationFactor
        );

        if (nodes.length === 0) {
            throw new Error(
                "No cache nodes available"
            );
        }

        const promises = nodes.map(async (node) => {
            try {
                const response = await fetch(
                    `${node}/cache/${encodeURIComponent(key)}`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ value, ttl })
                    }
                );

                await response.text();

                if (!response.ok) {
                    console.log(`${node} -> FAILED (${response.status})`);
                    return false;
                }

                console.log(`${node} -> STORED`);
                return true;

            } catch {
                console.log(`${node} -> DOWN`);
                this.removeNode(node);
                return false;
            }
        });

        const results = await Promise.all(promises);
        const successCount = results.filter(Boolean).length;

        if (successCount === 0) {
            throw new Error(
                "Failed to store value on any cache node"
            );
        }
    }

    // ========================================
    // GET
    // ========================================

    async get(
        key: string
    ): Promise<string | undefined> {

        const nodes = this.ring.getNodes(
            key,
            this.replicationFactor
        );

        if (nodes.length === 0) {
            throw new Error(
                "No cache nodes available"
            );
        }

        const promises = nodes.map(async (node) => {
            try {
                const response = await fetch(
                    `${node}/cache/${encodeURIComponent(key)}`
                );

                if (response.ok) {
                    const data = await response.json();
                    return data.value;
                }

                await response.text();
                
                if (response.status === 404) {
                    throw new Error("404");
                }
                throw new Error("Failed");
                
            } catch (err: any) {
                if (err.message !== "404") {
                    console.log(`Node ${node} unavailable`);
                    this.removeNode(node);
                }
                throw err;
            }
        });

        try {
            return await Promise.any(promises);
        } catch {
            return undefined;
        }
    }

    // ========================================
    // DELETE
    // ========================================

    async delete(
        key: string
    ): Promise<boolean> {

        const nodes = this.ring.getNodes(
            key,
            this.replicationFactor
        );

        if (nodes.length === 0) {
            throw new Error(
                "No cache nodes available"
            );
        }

        const promises = nodes.map(async (node) => {
            try {
                const response = await fetch(
                    `${node}/cache/${encodeURIComponent(key)}`,
                    { method: "DELETE" }
                );
                await response.text();
                return response.ok;
            } catch {
                console.log(`Node ${node} unavailable`);
                this.removeNode(node);
                return false;
            }
        });

        const results = await Promise.all(promises);
        return results.some(Boolean);
    }

    // ========================================
    // HEALTH CHECK
    // ========================================

    async checkNode(
        node: string
    ): Promise<boolean> {

        try {

            const response = await fetch(
                `${node}/health`
            );

            await response.text();

            return response.ok;

        } catch {

            return false;
        }
    }

    async checkAllNodes(): Promise<void> {

        for (
            const node of [
                ...this.activeNodes
            ]
        ) {

            const healthy =
                await this.checkNode(node);

            if (!healthy) {

                console.log(
                    `${node} -> DOWN`
                );

                this.removeNode(node);
            }
        }
    }

    // ========================================
    // REBALANCING
    // ========================================

    async rebalanceNode(
        node: string
    ): Promise<void> {

        console.log(
            `Starting rebalancing for ${node}...`
        );

        // Get healthy active nodes except
        // the node we're repairing.
        const sourceNodes =
            [...this.activeNodes].filter(
                existingNode =>
                    existingNode !== node
            );

        if (sourceNodes.length === 0) {

            console.log(
                `No source nodes available for ${node}`
            );

            return;
        }

        const syncedKeys =
            new Set<string>();

        // Ask healthy nodes for their data
        for (const sourceNode of sourceNodes) {

            try {

                const response =
                    await fetch(
                        `${sourceNode}/cache/entries`
                    );

                if (!response.ok) {
                    await response.text();
                    continue;
                }

                const entries =
                    await response.json();

                const rebalancePromises = entries.map(async (entry: any) => {
                    if (syncedKeys.has(entry.key)) {
                        return;
                    }

                    const replicas = this.ring.getNodes(entry.key, this.replicationFactor);
                    if (!replicas.includes(node)) {
                        return;
                    }

                    try {
                        const writeResponse = await fetch(
                            `${node}/cache/${encodeURIComponent(entry.key)}`,
                            {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ value: entry.value, ttl: entry.ttl })
                            }
                        );

                        await writeResponse.text();

                        if (writeResponse.ok) {
                            console.log(`${entry.key} -> moved to ${node}`);
                            syncedKeys.add(entry.key);
                        }
                    } catch {
                        console.log(`Failed to move ${entry.key} to ${node}`);
                    }
                });

                await Promise.all(rebalancePromises);

                /*
                 * We successfully got a snapshot
                 * from one healthy node.
                 *
                 * For this prototype that's enough.
                 */

                break;

            } catch {

                console.log(
                    `${sourceNode} unavailable during rebalancing`
                );
            }
        }

        console.log(
            `Rebalancing completed for ${node}`
        );
    }

    // ========================================
    // START HEALTH MONITORING
    // ========================================

    startHealthChecks(
        interval: number = 5000
    ): void {

        // Don't start multiple timers
        if (this.healthCheckInterval) {
            return;
        }

        console.log(
            `Health checks started (${interval}ms)`
        );

        this.healthCheckInterval =
            setInterval(async () => {

                // ====================================
                // 1. CHECK ACTIVE NODES
                // ====================================

                await Promise.all([...this.activeNodes].map(async (node) => {
                    const healthy = await this.checkNode(node);
                    if (!healthy) {
                        console.log(`${node} -> DOWN`);
                        this.removeNode(node);
                    }
                }));

                // ====================================
                // 2. CHECK RECOVERED NODES
                // ====================================

                await Promise.all([...this.knownNodes].map(async (node) => {
                    if (this.activeNodes.has(node)) {
                        return;
                    }

                    const healthy = await this.checkNode(node);
                    
                    if (healthy) {
                        console.log(`${node} -> RECOVERED`);
                        this.addNode(node);
                        await this.rebalanceNode(node);
                    }
                }));

            }, interval);
    }

    // ========================================
    // STOP HEALTH MONITORING
    // ========================================

    stopHealthChecks(): void {

        if (
            !this.healthCheckInterval
        ) {
            return;
        }

        clearInterval(
            this.healthCheckInterval
        );

        this.healthCheckInterval = null;

        console.log(
            "Health checks stopped"
        );
    }
    getRing(): Map<number, string> {
        return this.ring.getRing();
    }

    getNodesList(): string[] {
        return this.ring.getNodesList();
    }
}