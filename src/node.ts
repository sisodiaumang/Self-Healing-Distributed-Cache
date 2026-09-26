import express from "express";
import { Cache } from "./cache";

export class CacheNodeServer {

    private app;
    private cache: Cache;
    private port: number;

    constructor(
        port: number,
        capacity: number = 100
    ) {

        this.app =
            express();

        this.cache =
            new Cache(capacity);

        this.port =
            port;

        this.app.use(
            express.json()
        );

        this.setupRoutes();
    }


    private setupRoutes(): void {

        // --------------------------------
        // HEALTH
        // --------------------------------

        this.app.get(
            "/health",
            (req, res) => {

                res.status(200).json({

                    status:
                        "healthy",

                    port:
                        this.port

                });

            }
        );


        // --------------------------------
        // SET
        // --------------------------------

        this.app.put(
            "/cache/:key",
            (req, res) => {

                const key =
                    req.params.key;

                const {
                    value,
                    ttl
                } = req.body;

                if (
                    typeof value !==
                    "string"
                ) {

                    res.status(400).json({
                        error:
                            "value must be a string"
                    });

                    return;
                }

                this.cache.set(
                    key,
                    value,
                    ttl
                );

                res.status(200).json({

                    message:
                        "Value stored",

                    key

                });

            }
        );


        // --------------------------------
        // GET
        // --------------------------------

        this.app.get(
            "/cache/:key",
            (req, res) => {

                const key =
                    req.params.key;

                const value =
                    this.cache.get(key);

                if (
                    value === undefined
                ) {

                    res.status(404).json({
                        error:
                            "Key not found"
                    });

                    return;
                }

                res.status(200).json({

                    key,

                    value

                });

            }
        );


        // --------------------------------
        // DELETE
        // --------------------------------

        this.app.delete(
            "/cache/:key",
            (req, res) => {

                const key =
                    req.params.key;

                const deleted =
                    this.cache.delete(key);

                if (!deleted) {

                    res.status(404).json({
                        error:
                            "Key not found"
                    });

                    return;
                }

                res.status(200).json({

                    message:
                        "Key deleted",

                    key

                });

            }
        );


        // --------------------------------
        // STATS
        // --------------------------------

        this.app.get(
            "/cache/stats",
            (req, res) => {

                res.status(200).json(
                    this.cache.getStats()
                );

            }
        );


        // --------------------------------
        // ENTRIES
        // --------------------------------

        this.app.get(
            "/cache/entries",
            (req, res) => {

                res.status(200).json(
                    this.cache.getEntries()
                );

            }
        );

    }


    private server: any;

    start(): void {
        if (this.server) {
            console.log(`Cache node already running on port ${this.port}`);
            return;
        }

        this.server = this.app.listen(
            this.port,
            () => {
                console.log(
                    `Cache node running on port ${this.port}`
                );
            }
        );
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log(`Cache node on port ${this.port} stopped`);
        }
    }

}