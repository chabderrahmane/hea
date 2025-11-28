export interface Node {
  id: number;
  x?: number;
  y?: number;
}

export interface Link {
  source: number | Node;
  target: number | Node;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
  adjacency: Map<number, number[]>;
}

export interface Coloring {
  [nodeId: number]: number; // color index (1-based or 0-based depending on usage, we will use 1-based for math, 0-based for display)
}

export interface AlgorithmParams {
  k: number; // Number of colors
  popSize: number; // Population size (p)
  maxIterHEA: number;
  alpha: number; // For DSATUR
  tabuTenure: number; // t
  maxIterTabu: number;
}

export interface SimulationLog {
  step: number;
  message: string;
  conflicts: number;
  type: 'info' | 'success' | 'error' | 'best';
}
