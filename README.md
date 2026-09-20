# Self-Healing Distributed Cache

A distributed in-memory cache built with **TypeScript, Node.js, Express, and Docker**.

The system distributes cache data across multiple nodes using **consistent hashing with virtual nodes**, replicates data for fault tolerance, detects failed nodes through health checks, automatically removes failed nodes from the hash ring, and repairs/rebalances data when nodes recover.

---

## 🚀 Features

- **LRU Cache**
  - O(1) average lookup using a HashMap
  - Doubly linked list for LRU ordering
  - Automatic eviction when capacity is exceeded

- **TTL Support**
  - Entries can expire automatically
  - Remaining TTL is preserved during data synchronization

- **Distributed Cache Nodes**
  - Multiple independent cache servers
  - Each node runs as a separate process/container

- **Consistent Hashing**
  - Keys are distributed across cache nodes
  - Minimizes key movement when nodes are added or removed

- **Virtual Nodes**
  - Each physical node owns multiple positions on the hash ring
  - Improves distribution and reduces imbalance

- **Replication**
  - Each key can be stored on multiple nodes
  - Configurable replication factor

- **Replica Fallback**
  - If the primary node fails, reads can fall back to replicas

- **Health Monitoring**
  - Periodic health checks
  - Failed nodes are automatically detected

- **Automatic Failure Handling**
  - Failed nodes are removed from the hash ring
  - Traffic is automatically redirected to healthy nodes

- **Node Recovery**
  - Recovered nodes are automatically detected
  - Nodes are added back to the hash ring

- **Data Synchronization & Rebalancing**
  - Recovered nodes receive data they should own
  - Data placement is recalculated after topology changes

- **Docker Support**
  - Each cache node runs in its own container
  - Easy failure/recovery testing

---

## 🏗️ Architecture

```text
                         ┌───────────────────┐
                         │    Cache Router   │
                         │                   │
                         │ Consistent Hash   │
                         │ Replication       │
                         │ Health Monitoring │
                         └─────────┬─────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  │                │                │
                  ▼                ▼                ▼
            ┌──────────┐     ┌──────────┐     ┌──────────┐
            │ Cache 1  │     │ Cache 2  │     │ Cache 3  │
            │  :3001   │     │  :3002   │     │  :3003   │
            └──────────┘     └──────────┘     └──────────┘
                  │                │                │
                  └────────────────┴────────────────┘
                         Docker Network
````

---

## 🔄 Self-Healing Flow

When a cache node fails:

```text
                Node 2 fails
                     │
                     ▼
              Health check
                     │
                     ▼
             Failure detected
                     │
                     ▼
          Remove Node 2 from ring
                     │
                     ▼
          Requests use healthy
              replicas/nodes
```

When the node recovers:

```text
              Node 2 recovers
                     │
                     ▼
              Health check
                     │
                     ▼
             Node marked healthy
                     │
                     ▼
          Add Node 2 to hash ring
                     │
                     ▼
             Rebalance data
                     │
                     ▼
          Node 2 becomes healthy
          and receives its data
```

---

## 🧠 Consistent Hashing

Instead of assigning keys directly using:

```text
hash(key) % numberOfNodes
```

the project uses a consistent hash ring.

```text
                    0
                    │
              Node 1 #12
                    │
        Node 3 #42  │
             \      │
              \     │
               \    │
                \   │
             Node 2 #71
                    │
                    ▼
                  2³²
```

Each physical node is represented by multiple **virtual nodes** on the ring.

For example:

```text
Node 1
 ├── node1#0
 ├── node1#1
 ├── node1#2
 └── ...

Node 2
 ├── node2#0
 ├── node2#1
 ├── node2#2
 └── ...

Node 3
 ├── node3#0
 ├── node3#1
 ├── node3#2
 └── ...
```

This produces a more balanced distribution of keys.

---

## 📊 Consistent Hashing Test

The implementation was tested with:

* 3 physical nodes
* 100 virtual nodes per physical node
* 1000 keys

Example distribution:

```text
Node 1 → 310 keys
Node 2 → 351 keys
Node 3 → 339 keys
```

When adding a fourth node:

```text
Before:

Node 1 → 309
Node 2 → 351
Node 3 → 340

After:

Node 1 → 186
Node 2 → 215
Node 3 → 331
Node 4 → 268
```

Approximately **26.8% of keys moved**, which is close to the expected ~25% movement when adding one node to a four-node system.

---

## 🔁 Replication

The cache uses a configurable replication factor.

For example:

```text
Replication Factor = 2
```

A key might be stored as:

```text
user:123
    │
    ├── Node 2  ← Primary
    │
    └── Node 3  ← Replica
```

If Node 2 fails:

```text
GET user:123
       │
       ▼
    Node 2 ❌
       │
       ▼
    Node 3 ✅
       │
       ▼
   "Umang"
```

This allows the cache to continue serving data when a node becomes unavailable.

---

## 💾 Cache Implementation

Each cache node uses:

```text
HashMap + Doubly Linked List
```

The HashMap provides fast lookup:

```text
key → CacheNode
```

The doubly linked list maintains LRU order:

```text
MRU
 ↓
[A] ⇄ [B] ⇄ [C] ⇄ [D]
                       ↑
                      LRU
```

When an entry is accessed, it moves to the front.

When the cache exceeds its capacity, the least recently used entry is removed.

---

## ⏱️ TTL

Entries can optionally have a TTL:

```text
PUT /cache/user:123

{
  "value": "Umang",
  "ttl": 60000
}
```

The entry expires after 60 seconds.

During synchronization, the system calculates the **remaining TTL** rather than resetting the original TTL.

For example:

```text
Original TTL: 60 seconds

20 seconds pass

Remaining TTL: 40 seconds
```

This prevents recovered nodes from keeping expired data alive longer than intended.

---

# 📡 API

Each cache node exposes the following endpoints.

### Health

```http
GET /health
```

Example:

```json
{
  "status": "healthy",
  "port": 3001
}
```

---

### Set

```http
PUT /cache/:key
```

Request:

```json
{
  "value": "Umang",
  "ttl": 60000
}
```

---

### Get

```http
GET /cache/:key
```

Response:

```json
{
  "key": "user:123",
  "value": "Umang"
}
```

---

### Delete

```http
DELETE /cache/:key
```

---

### Cache Statistics

```http
GET /cache/stats
```

---

### Internal Cache Snapshot

```http
GET /cache/entries
```

Used internally for synchronization and rebalancing.

---

# 🐳 Docker

Each cache node runs in its own container.

```text
cache1 → localhost:3001
cache2 → localhost:3002
cache3 → localhost:3003
```

Start the cluster:

```bash
docker compose up -d
```

Check running containers:

```bash
docker ps
```

Stop the cluster:

```bash
docker compose down
```

View logs:

```bash
docker compose logs
```

---

## 💥 Failure Recovery Test

To simulate a node failure:

```bash
docker stop cache2
```

The router detects the failure:

```text
http://localhost:3002 -> DOWN
http://localhost:3002 removed from hash ring
```

Recover the node:

```bash
docker start cache2
```

The router detects the recovered node:

```text
http://localhost:3002 -> RECOVERED
http://localhost:3002 added back to hash ring
Starting rebalancing for http://localhost:3002...
Rebalancing completed for http://localhost:3002
```

This demonstrates the self-healing behavior of the system.

---

# 📁 Project Structure

```text
self_healing_distributed_cache/
│
├── src/
│   ├── cache.ts
│   ├── consistentHash.ts
│   ├── node.ts
│   ├── nodeRegistry.ts
│   ├── router.ts
│   ├── index.ts
│   ├── testRing.ts
│   ├── testRouter.ts
│   └── testSync.ts
│
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

# 🛠️ Tech Stack

| Technology         | Purpose                  |
| ------------------ | ------------------------ |
| TypeScript         | Application development  |
| Node.js            | Runtime                  |
| Express            | Cache node HTTP API      |
| Docker             | Containerization         |
| Docker Compose     | Multi-node orchestration |
| Consistent Hashing | Data distribution        |
| LRU                | Cache eviction           |
| Virtual Nodes      | Load distribution        |

---

# 🚀 Getting Started

## Prerequisites

* Node.js 22+
* npm
* Docker Desktop

## Install dependencies

```bash
npm install
```

## Run locally

The cache node uses the `NODE_PORT` environment variable.

PowerShell:

```powershell
$env:NODE_PORT="3001"
npx tsx src/index.ts
```

For multiple nodes, run separate processes using ports:

```text
3001
3002
3003
```

## Run with Docker

```bash
docker compose up -d --build
```

Verify:

```bash
docker ps
```

---

# 🧪 Testing

Test consistent hashing:

```bash
npx tsx src/testRing.ts
```

Test router:

```bash
npx tsx src/testRouter.ts
```

Test replication and cache operations:

```bash
npx tsx src/testSync.ts
```

---

# 🔮 Future Improvements

The current implementation is a learning/prototype distributed cache. Potential improvements include:

* Write/read quorums
* Better node discovery
* Persistent storage
* More robust failure detection
* Concurrent replication
* Background anti-entropy repair
* Proper ownership transfer and stale-copy cleanup
* Metrics and observability
* Prometheus/Grafana integration
* Load testing
* Authentication and authorization
* Graceful node shutdown
* Persistent WAL/logging
* Automated integration tests
* Kubernetes deployment

---

# 🎯 Learning Goals

This project was built to understand practical distributed-systems concepts including:

* Distributed caching
* Consistent hashing
* Virtual nodes
* Replication
* Fault tolerance
* Failure detection
* Node recovery
* Data synchronization
* Rebalancing
* Containerized distributed systems

---

## 📌 Project Status

**Core distributed cache implementation: Complete**

The system has been tested with:

* Multiple cache nodes
* Virtual-node consistent hashing
* Replication
* Node failures
* Automatic failure detection
* Node recovery
* Data repair/rebalancing
* Dockerized cache nodes

---

## 👨‍💻 Author

**Umang Sisodia**

Built as a hands-on distributed-systems project to explore caching, fault tolerance, consistent hashing, replication, and self-healing infrastructure.

```