import { GraphData, Coloring, AlgorithmParams, Node, Link } from '../types';

// --- Helpers ---

export const generateErdosRenyi = (n: number, p: number): GraphData => {
  const nodes: Node[] = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const links: Link[] = [];
  const adjacency = new Map<number, number[]>();

  nodes.forEach(node => adjacency.set(node.id, []));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.random() < p) {
        const u = nodes[i].id;
        const v = nodes[j].id;
        links.push({ source: u, target: v });
        adjacency.get(u)?.push(v);
        adjacency.get(v)?.push(u);
      }
    }
  }

  return { nodes, links, adjacency };
};

export const parseEdgesInput = (input: string, n: number): GraphData => {
  const nodes: Node[] = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const links: Link[] = [];
  const adjacency = new Map<number, number[]>();
  nodes.forEach(node => adjacency.set(node.id, []));

  // Expect input like ((1,2),(2,3))
  const cleanInput = input.replace(/\s/g, '');
  const pairs = cleanInput.match(/\(\d+,\d+\)/g);

  if (pairs) {
    pairs.forEach(pair => {
      const parts = pair.replace(/[()]/g, '').split(',');
      const u = parseInt(parts[0]);
      const v = parseInt(parts[1]);
      if (u >= 1 && u <= n && v >= 1 && v <= n) {
         // Check duplicates
         const existing = links.find(l => 
          (l.source === u && l.target === v) || (l.source === v && l.target === u)
         );
         if (!existing && u !== v) {
            links.push({ source: u, target: v });
            adjacency.get(u)?.push(v);
            adjacency.get(v)?.push(u);
         }
      }
    });
  }

  return { nodes, links, adjacency };
};

const countConflicts = (coloring: Coloring, adjacency: Map<number, number[]>): number => {
  let conflicts = 0;
  adjacency.forEach((neighbors, node) => {
    neighbors.forEach(neighbor => {
      if (coloring[node] === coloring[neighbor] && coloring[node] !== 0) {
        conflicts++;
      }
    });
  });
  return conflicts / 2;
};

// --- DSATUR ---

export const runDSATUR = (graph: GraphData, k: number): Coloring => {
  const { nodes, adjacency } = graph;
  const coloring: Coloring = {};
  const saturation: Record<number, number> = {};
  const degrees: Record<number, number> = {};
  
  nodes.forEach(n => {
    coloring[n.id] = 0; // 0 means uncolored
    saturation[n.id] = 0;
    degrees[n.id] = adjacency.get(n.id)?.length || 0;
  });

  const getSaturation = (nodeId: number) => {
    const neighborColors = new Set<number>();
    adjacency.get(nodeId)?.forEach(neighbor => {
      if (coloring[neighbor] !== 0) {
        neighborColors.add(coloring[neighbor]);
      }
    });
    return neighborColors.size;
  };

  const uncoloredCount = () => nodes.filter(n => coloring[n.id] === 0).length;

  // Initial step: choose node with max degree
  let maxDegreeNode = nodes.reduce((a, b) => degrees[a.id] > degrees[b.id] ? a : b);
  coloring[maxDegreeNode.id] = 1;

  while (uncoloredCount() > 0) {
    // Update saturation
    nodes.forEach(n => {
      if (coloring[n.id] === 0) {
        saturation[n.id] = getSaturation(n.id);
      }
    });

    // Pick uncolored node with max saturation
    const uncolored = nodes.filter(n => coloring[n.id] === 0);
    
    // Sort by saturation desc, then degree desc
    uncolored.sort((a, b) => {
      if (saturation[a.id] !== saturation[b.id]) {
        return saturation[b.id] - saturation[a.id];
      }
      return degrees[b.id] - degrees[a.id];
    });

    const chosen = uncolored[0];
    
    // Find lowest valid color
    const usedColors = new Set<number>();
    adjacency.get(chosen.id)?.forEach(neighbor => {
      if (coloring[neighbor] !== 0) usedColors.add(coloring[neighbor]);
    });

    let chosenColor = 1;
    while (usedColors.has(chosenColor)) {
      chosenColor++;
    }

    // If k is strict and we exceed k, we assign a random color in 1..k (heuristic for HEA init)
    // Or we keep it strictly legal if possible.
    // For HEA initialization, we often want a valid coloring even if it uses > k colors, 
    // BUT the prompt implies fixed k. TabuCol handles conflicts.
    // Let's cap at k if we are in a fixed k scenario, creating conflicts.
    if (chosenColor > k) {
        // Find color in 1..k that minimizes conflicts (simple heuristic)
        const counts = new Array(k + 1).fill(0);
        adjacency.get(chosen.id)?.forEach(neighbor => {
            const c = coloring[neighbor];
            if (c >= 1 && c <= k) counts[c]++;
        });
        // pick min index
        let minConf = Infinity;
        let bestC = 1;
        for(let c=1; c<=k; c++) {
            if (counts[c] < minConf) {
                minConf = counts[c];
                bestC = c;
            }
        }
        chosenColor = bestC;
    }

    coloring[chosen.id] = chosenColor;
  }

  return coloring;
};

// --- TabuCol ---

export const runTabuCol = (
  graph: GraphData, 
  k: number, 
  initialColoring: Coloring, 
  maxIter: number,
  tabuTenure: number
): { coloring: Coloring, conflicts: number } => {
  
  let currentS = { ...initialColoring };
  // Ensure all colors are within 1..k
  for (const key in currentS) {
    if (currentS[key] > k) currentS[key] = Math.floor(Math.random() * k) + 1;
  }

  let bestS = { ...currentS };
  let currentConflicts = countConflicts(currentS, graph.adjacency);
  let bestConflicts = currentConflicts;

  const tabuMatrix: Record<number, Record<number, number>> = {}; // node -> color -> iter
  graph.nodes.forEach(n => {
    tabuMatrix[n.id] = {};
    for (let c = 1; c <= k; c++) tabuMatrix[n.id][c] = 0;
  });

  for (let iter = 1; iter <= maxIter; iter++) {
    if (bestConflicts === 0) break;

    // Find neighbors with conflicts
    const conflictedNodes = graph.nodes.filter(n => {
      const neighbors = graph.adjacency.get(n.id) || [];
      return neighbors.some(neigh => currentS[neigh] === currentS[n.id]);
    });

    if (conflictedNodes.length === 0) break; // Should be covered by bestConflicts == 0 check but safety first

    let bestMove = { node: -1, oldColor: -1, newColor: -1, delta: Infinity };

    // Explore 1-move neighborhood
    // Optimization: only check conflicted nodes
    for (const node of conflictedNodes) {
      const u = node.id;
      const oldColor = currentS[u];
      
      // Calculate current conflicts for u
      const neighbors = graph.adjacency.get(u) || [];
      let currentNodeConflicts = 0;
      neighbors.forEach(v => { if (currentS[v] === oldColor) currentNodeConflicts++; });

      for (let color = 1; color <= k; color++) {
        if (color === oldColor) continue;

        // Calculate new conflicts if we move u to color
        let newNodeConflicts = 0;
        neighbors.forEach(v => { if (currentS[v] === color) newNodeConflicts++; });

        const delta = newNodeConflicts - currentNodeConflicts;

        // Tabu check
        const isTabu = tabuMatrix[u][color] >= iter;
        const isAspiration = (currentConflicts + delta < bestConflicts);

        if (!isTabu || isAspiration) {
          if (delta < bestMove.delta) {
            bestMove = { node: u, oldColor, newColor: color, delta };
          } else if (delta === bestMove.delta && Math.random() < 0.5) {
             // Random tie break
             bestMove = { node: u, oldColor, newColor: color, delta };
          }
        }
      }
    }

    if (bestMove.node !== -1) {
      currentS[bestMove.node] = bestMove.newColor;
      currentConflicts += bestMove.delta;
      tabuMatrix[bestMove.node][bestMove.oldColor] = iter + tabuTenure + Math.floor(Math.random() * 2); // slight randomization

      if (currentConflicts < bestConflicts) {
        bestConflicts = currentConflicts;
        bestS = { ...currentS };
      }
    } else {
        // No valid move found (all tabu and no aspiration), just pick random move
        const u = conflictedNodes[Math.floor(Math.random() * conflictedNodes.length)].id;
        const randColor = Math.floor(Math.random() * k) + 1;
        if (randColor !== currentS[u]) {
             currentS[u] = randColor;
             // Recalc full conflicts (lazy way for restart)
             currentConflicts = countConflicts(currentS, graph.adjacency);
        }
    }
  }

  return { coloring: bestS, conflicts: bestConflicts };
};

// --- HEA (GPX Crossover) ---

const getClasses = (coloring: Coloring, k: number): Map<number, Set<number>> => {
  const classes = new Map<number, Set<number>>();
  for (let c = 1; c <= k; c++) classes.set(c, new Set());
  for (const [nodeId, color] of Object.entries(coloring)) {
    classes.get(color)?.add(parseInt(nodeId));
  }
  return classes;
};

const gpxCrossover = (p1: Coloring, p2: Coloring, k: number, graph: GraphData): Coloring => {
  const classes1 = getClasses(p1, k);
  const classes2 = getClasses(p2, k);
  
  const child: Coloring = {};
  graph.nodes.forEach(n => child[n.id] = 0);
  
  const unassigned = new Set(graph.nodes.map(n => n.id));
  
  let currentParent = 1; // 1 or 2

  for (let c = 1; c <= k; c++) {
    // Determine which class from the current parent has the most vertices 
    // that are still unassigned in child
    let bestColor = -1;
    let bestCount = -1;
    
    const parentClasses = currentParent === 1 ? classes1 : classes2;
    
    parentClasses.forEach((nodesInClass, color) => {
        let count = 0;
        nodesInClass.forEach(nid => {
            if (unassigned.has(nid)) count++;
        });
        if (count > bestCount) {
            bestCount = count;
            bestColor = color;
        }
    });

    if (bestColor !== -1) {
        parentClasses.get(bestColor)?.forEach(nid => {
            if (unassigned.has(nid)) {
                child[nid] = c;
                unassigned.delete(nid);
            }
        });
    }

    currentParent = currentParent === 1 ? 2 : 1;
  }

  // Randomly assign remaining
  unassigned.forEach(nid => {
    child[nid] = Math.floor(Math.random() * k) + 1;
  });

  return child;
};

export const runHEAStep = (
    population: {coloring: Coloring, conflicts: number}[],
    graph: GraphData,
    params: AlgorithmParams
): { newPopulation: typeof population, best: Coloring, bestConflicts: number, logs: string[] } => {
    
    const logs: string[] = [];
    
    // Select parents (Tournament)
    const tournament = (size: number) => {
        let bestIdx = -1;
        let bestFit = Infinity;
        for(let i=0; i<size; i++) {
            const idx = Math.floor(Math.random() * population.length);
            if (population[idx].conflicts < bestFit) {
                bestFit = population[idx].conflicts;
                bestIdx = idx;
            }
        }
        return population[bestIdx];
    }

    const p1 = tournament(3);
    const p2 = tournament(3);

    // Crossover
    const childInit = gpxCrossover(p1.coloring, p2.coloring, params.k, graph);
    
    // Mutation / Local Search (TabuCol)
    const { coloring: childImproved, conflicts: childConflicts } = runTabuCol(
        graph, 
        params.k, 
        childInit, 
        params.maxIterTabu, 
        params.tabuTenure
    );

    let newPopulation = [...population];
    
    // Replacement: if child is better than worst in population
    let worstIdx = -1;
    let worstConf = -1;
    newPopulation.forEach((ind, idx) => {
        if (ind.conflicts > worstConf) {
            worstConf = ind.conflicts;
            worstIdx = idx;
        }
    });

    // Also avoid duplicates
    const isDuplicate = newPopulation.some(ind => ind.conflicts === childConflicts); // Simple check, ideally check structure

    if (childConflicts < worstConf && !isDuplicate) {
        newPopulation[worstIdx] = { coloring: childImproved, conflicts: childConflicts };
        logs.push(`Child (Conf: ${childConflicts}) replaced Individual ${worstIdx} (Conf: ${worstConf})`);
    } else {
        logs.push(`Child (Conf: ${childConflicts}) discarded.`);
    }

    // Find best
    let best = newPopulation[0].coloring;
    let bestConflicts = newPopulation[0].conflicts;
    newPopulation.forEach(ind => {
        if (ind.conflicts < bestConflicts) {
            bestConflicts = ind.conflicts;
            best = ind.coloring;
        }
    });

    return { newPopulation, best, bestConflicts, logs };
};

export const initPopulation = (graph: GraphData, params: AlgorithmParams) => {
    const population: {coloring: Coloring, conflicts: number}[] = [];
    for(let i=0; i<params.popSize; i++) {
        // Init with DSATUR-like randomized greedy or random
        // To add diversity, let's use randomized greedy
        const initC = runDSATUR(graph, params.k); // This tries to be valid
        // Improve with TabuCol briefly
        const res = runTabuCol(graph, params.k, initC, params.maxIterTabu, params.tabuTenure);
        population.push(res);
    }
    return population;
};
