import express from "express";
import path from "path";
import { execFile } from "child_process";

import { CacheRouter } from "./router";

const app = express();

const DASHBOARD_PORT = 4000;

// ============================================================
// CACHE NODES
// ============================================================

const nodes = process.env.CACHE_NODES
    ? process.env.CACHE_NODES.split(",")
    : [
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3003"
      ];

// Docker container mapping
const containers: Record<string, string> = {
    "3001": "cache1",
    "3002": "cache2",
    "3003": "cache3"
};

// ============================================================
// CACHE ROUTER
// ============================================================

const router = new CacheRouter(
    nodes,
    2 // replication factor
);

// Start automatic failure detection
// and node recovery
router.startHealthChecks(5000);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

// ============================================================
// EVENTS
// ============================================================

interface DashboardEvent {
    id: number;
    type: string;
    message: string;
    timestamp: string;
}

const events: DashboardEvent[] = [];

let eventId = 0;

function addEvent(
    type: string,
    message: string
): void {

    events.unshift({
        id: ++eventId,
        type,
        message,
        timestamp: new Date().toISOString()
    });

    // Keep only latest 100 events
    if (events.length > 100) {
        events.pop();
    }

    console.log(
        `[${type}] ${message}`
    );
}

// ============================================================
// DASHBOARD HTML
// ============================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            process.cwd(),
            "dashboard.html"
        )
    );

});

// ============================================================
// GET ALL NODE STATUS
// ============================================================

app.get(
    "/api/nodes",
    async (req, res) => {

        const result = [];

        for (const node of nodes) {

            const port =
                node.split(":").pop()!;

            const healthy =
                await router.checkNode(node);

            result.push({
                port: Number(port),
                url: node,
                container: containers[port],
                status: healthy
                    ? "healthy"
                    : "down"
            });
        }

        res.json({
            nodes: result
        });

    }
);

// ============================================================
// STOP DOCKER NODE
// ============================================================

app.post(
    "/api/nodes/:port/stop",
    (req, res) => {

        const port =
            req.params.port;

        const container =
            containers[port];

        if (!container) {

            res.status(400).json({
                error: "Invalid node"
            });

            return;
        }

        addEvent(
            "NODE",
            `Stopping node ${port} (${container})`
        );

        execFile(
            "docker",
            [
                "stop",
                container
            ],
            (
                error,
                stdout,
                stderr
            ) => {

                if (error) {

                    console.error(
                        "Docker stop error:",
                        stderr
                    );

                    addEvent(
                        "ERROR",
                        `Failed to stop node ${port}`
                    );

                    res.status(500).json({
                        error:
                            error.message
                    });

                    return;
                }

                addEvent(
                    "NODE",
                    `Node ${port} stopped`
                );

                res.json({
                    success: true,
                    message:
                        `${container} stopped`,
                    output:
                        stdout.trim()
                });

            }
        );

    }
);

// ============================================================
// START DOCKER NODE
// ============================================================

app.post(
    "/api/nodes/:port/start",
    (req, res) => {

        const port =
            req.params.port;

        const container =
            containers[port];

        if (!container) {

            res.status(400).json({
                error: "Invalid node"
            });

            return;
        }

        addEvent(
            "NODE",
            `Starting node ${port} (${container})`
        );

        execFile(
            "docker",
            [
                "start",
                container
            ],
            (
                error,
                stdout,
                stderr
            ) => {

                if (error) {

                    console.error(
                        "Docker start error:",
                        stderr
                    );

                    addEvent(
                        "ERROR",
                        `Failed to start node ${port}`
                    );

                    res.status(500).json({
                        error:
                            error.message
                    });

                    return;
                }

                addEvent(
                    "NODE",
                    `Node ${port} started`
                );

                res.json({
                    success: true,
                    message:
                        `${container} started`,
                    output:
                        stdout.trim()
                });

            }
        );

    }
);

// ============================================================
// CACHE SET
// ============================================================

app.put(
    "/api/cache/:key",
    async (req, res) => {

        try {

            const key =
                req.params.key;

            const {
                value,
                ttl
            } = req.body;

            if (
                typeof value !== "string"
            ) {

                res.status(400).json({
                    error:
                        "value must be a string"
                });

                return;
            }

            await router.set(
                key,
                value,
                ttl
            );

            addEvent(
                "CACHE",
                `SET "${key}"`
            );

            res.json({
                success: true,
                key,
                value
            });

        } catch (error) {

            console.error(error);

            addEvent(
                "ERROR",
                `SET failed for "${req.params.key}"`
            );

            res.status(500).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to store value"
            });

        }

    }
);

// ============================================================
// CACHE GET
// ============================================================

app.get(
    "/api/cache/:key",
    async (req, res) => {

        try {

            const key =
                req.params.key;

            const value =
                await router.get(key);

            if (value === undefined) {

                addEvent(
                    "CACHE",
                    `GET "${key}" → MISS`
                );

                res.status(404).json({
                    error:
                        "Key not found"
                });

                return;
            }

            addEvent(
                "CACHE",
                `GET "${key}" → HIT`
            );

            res.json({
                success: true,
                key,
                value
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to get value"
            });

        }

    }
);

// ============================================================
// CACHE DELETE
// ============================================================

app.delete(
    "/api/cache/:key",
    async (req, res) => {

        try {

            const key =
                req.params.key;

            const deleted =
                await router.delete(key);

            if (!deleted) {

                addEvent(
                    "CACHE",
                    `DELETE "${key}" → NOT FOUND`
                );

                res.status(404).json({
                    error:
                        "Key not found"
                });

                return;
            }

            addEvent(
                "CACHE",
                `DELETE "${key}"`
            );

            res.json({
                success: true,
                key
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to delete value"
            });

        }

    }
);

// ============================================================
// GET NODE ENTRIES
// ============================================================

app.get(
    "/api/nodes/:port/entries",
    async (req, res) => {

        const port =
            req.params.port;

        if (!containers[port]) {

            res.status(400).json({
                error:
                    "Invalid node"
            });

            return;
        }

        try {

            const response =
                await fetch(
                    `http://localhost:${port}/cache/entries`
                );

            if (!response.ok) {

                await response.text();
                res.status(
                    response.status
                ).json({
                    error:
                        "Node unavailable"
                });

                return;
            }

            const data =
                await response.json();

            res.json({
                port: Number(port),
                entries: data
            });

        } catch {

            res.status(503).json({
                error:
                    "Node unavailable"
            });

        }

    }
);

// ============================================================
// GET NODE STATS
// ============================================================

app.get(
    "/api/nodes/:port/stats",
    async (req, res) => {

        const port =
            req.params.port;

        if (!containers[port]) {

            res.status(400).json({
                error:
                    "Invalid node"
            });

            return;
        }

        try {

            const response =
                await fetch(
                    `http://localhost:${port}/cache/stats`
                );

            if (!response.ok) {

                await response.text();
                res.status(
                    response.status
                ).json({
                    error:
                        "Node unavailable"
                });

                return;
            }

            const data =
                await response.json();

            res.json({
                port: Number(port),
                stats: data
            });

        } catch {

            res.status(503).json({
                error:
                    "Node unavailable"
            });

        }

    }
);

// ============================================================
// GLOBAL STATS
// ============================================================

app.get(
    "/api/stats",
    async (req, res) => {

        const nodeStats = [];

        let totalHits = 0;
        let totalMisses = 0;
        let totalEvictions = 0;
        let totalSize = 0;

        for (const node of nodes) {

            const port =
                node.split(":").pop()!;

            try {

                const response =
                    await fetch(
                        `${node}/cache/stats`
                    );

                if (!response.ok) {
                    await response.text();
                    continue;
                }

                const stats =
                    await response.json();

                nodeStats.push({
                    port: Number(port),
                    stats
                });

                totalHits +=
                    stats.hits ?? 0;

                totalMisses +=
                    stats.misses ?? 0;

                totalEvictions +=
                    stats.evictions ?? 0;

                totalSize +=
                    stats.size ?? 0;

            } catch {

                // Node is currently down

            }

        }

        res.json({

            totals: {

                hits:
                    totalHits,

                misses:
                    totalMisses,

                evictions:
                    totalEvictions,

                size:
                    totalSize

            },

            nodes:
                nodeStats

        });

    }
);

// ============================================================
// EVENTS
// ============================================================

app.get(
    "/api/events",
    (req, res) => {

        res.json({
            events
        });

    }
);

// ============================================================
// HASH RING INFORMATION
// ============================================================

app.get(
    "/api/ring",
    (req, res) => {

        const ring =
            router.getRing();

        const ringEntries =
            Array.from(
                ring.entries()
            )
            .map(
                ([hash, node]) => ({
                    hash,
                    node
                })
            )
            .sort(
                (a, b) =>
                    a.hash - b.hash
            );

        res.json({

            nodes:
                router.getNodesList(),

            virtualNodes:
                ringEntries.length,

            ring:
                ringEntries

        });

    }
);

// ============================================================
// START SERVER
// ============================================================

if (!process.env.VERCEL) {
    app.listen(
        DASHBOARD_PORT,
        "127.0.0.1",
        () => {

            addEvent(
                "SYSTEM",
                `Dashboard started on port ${DASHBOARD_PORT}`
            );

            console.log("");
            console.log(
                "=========================================="
            );
            console.log(
                " Self-Healing Distributed Cache"
            );
            console.log(
                " Dashboard Server"
            );
            console.log(
                "=========================================="
            );
            console.log(
                ` Dashboard: http://localhost:${DASHBOARD_PORT}`
            );
            console.log(
                " Nodes:     3001, 3002, 3003"
            );
            console.log(
                " Replicas:  2"
            );
            console.log(
                " Health:    every 5 seconds"
            );
            console.log(
                "=========================================="
            );
            console.log("");

        }
    );
}

export default app;