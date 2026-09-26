process.env.STANDALONE = "true";

const { CacheNodeServer } = require("./node");
const dashboardApp = require("./dashboard").default;

// Start 3 internal cache nodes
const node1 = new CacheNodeServer(3001, 100);
const node2 = new CacheNodeServer(3002, 100);
const node3 = new CacheNodeServer(3003, 100);

(global as any).standaloneNodes = {
    "3001": node1,
    "3002": node2,
    "3003": node3
};

node1.start();
node2.start();
node3.start();

// Start the dashboard
const DASHBOARD_PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

dashboardApp.listen(DASHBOARD_PORT, "0.0.0.0", () => {
    console.log(`==========================================`);
    console.log(` Self-Healing Cache - ALL-IN-ONE MODE`);
    console.log(` Dashboard running on port ${DASHBOARD_PORT}`);
    console.log(` Internal Cache Nodes: 3001, 3002, 3003`);
    console.log(`==========================================`);
});
