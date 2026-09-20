import { CacheNodeServer } from "./node";

const port =
    Number(process.env.NODE_PORT);

if (!port) {

    throw new Error(
        "NODE_PORT environment variable is required"
    );

}

const node =
    new CacheNodeServer(
        port,
        100
    );

node.start();