export class NodeRegistry {
    private nodes: Set<string>;

    constructor(nodes: string[] = []) {
        this.nodes = new Set(nodes);
    }

    add(node: string): void {
        this.nodes.add(node);
    }

    remove(node: string): void {
        this.nodes.delete(node);
    }

    has(node: string): boolean {
        return this.nodes.has(node);
    }

    getAll(): string[] {
        return [...this.nodes];
    }
}