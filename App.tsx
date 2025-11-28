import React, { useState, useCallback, useRef } from 'react';
import { Play, RotateCcw, Plus, Dna, Activity, FileCode } from 'lucide-react';
import GraphVisualizer from './components/GraphVisualizer';
import PythonCodeModal from './components/PythonCodeModal';
import { generateErdosRenyi, parseEdgesInput, runDSATUR, runTabuCol, initPopulation, runHEAStep } from './services/graphAlgorithms';
import { GraphData, Coloring, SimulationLog, AlgorithmParams } from './types';

const INITIAL_PARAMS: AlgorithmParams = {
  k: 3,
  popSize: 10,
  maxIterHEA: 50,
  alpha: 2,
  tabuTenure: 5,
  maxIterTabu: 20,
};

function App() {
  const [graph, setGraph] = useState<GraphData>(() => generateErdosRenyi(10, 0.3));
  const [params, setParams] = useState<AlgorithmParams>(INITIAL_PARAMS);
  const [coloring, setColoring] = useState<Coloring>({});
  const [logs, setLogs] = useState<SimulationLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPythonModalOpen, setIsPythonModalOpen] = useState(false);
  
  // Graph Generation Inputs
  const [genType, setGenType] = useState<'random' | 'manual'>('random');
  const [numNodes, setNumNodes] = useState(15);
  const [probEdges, setProbEdges] = useState(0.3);
  const [manualEdges, setManualEdges] = useState("((1,2),(2,3),(3,4),(4,1))");

  // Simulation State
  const populationRef = useRef<{coloring: Coloring, conflicts: number}[]>([]);
  const heaIterRef = useRef(0);
  const simulationInterval = useRef<number | null>(null);

  const addLog = (msg: string, type: SimulationLog['type'] = 'info', conflicts: number = -1) => {
    setLogs(prev => [...prev.slice(-49), { step: Date.now(), message: msg, type, conflicts }]);
  };

  const handleGenerateGraph = () => {
    let newGraph: GraphData;
    if (genType === 'random') {
      newGraph = generateErdosRenyi(numNodes, probEdges);
    } else {
      newGraph = parseEdgesInput(manualEdges, numNodes);
    }
    setGraph(newGraph);
    setColoring({});
    setLogs([]);
    addLog(`Graph generated: ${newGraph.nodes.length} nodes, ${newGraph.links.length} edges`, 'success');
  };

  const runAlgorithm = (algo: 'DSATUR' | 'TabuCol' | 'HEA') => {
    if (isRunning) return;

    if (algo === 'DSATUR') {
      const res = runDSATUR(graph, params.k);
      setColoring(res);
      addLog('Ran DSATUR', 'success');
    } 
    
    else if (algo === 'TabuCol') {
      const init = runDSATUR(graph, params.k); // Start with greedy
      const { coloring: res, conflicts } = runTabuCol(graph, params.k, init, 1000, params.tabuTenure);
      setColoring(res);
      addLog(`Ran TabuCol. Conflicts: ${conflicts}`, conflicts === 0 ? 'success' : 'info', conflicts);
    } 
    
    else if (algo === 'HEA') {
      startHEA();
    }
  };

  const startHEA = () => {
    setIsRunning(true);
    addLog('Starting HEA...', 'info');
    
    // Init Population
    populationRef.current = initPopulation(graph, params);
    heaIterRef.current = 0;

    // Find initial best
    let best = populationRef.current[0];
    populationRef.current.forEach(ind => {
        if(ind.conflicts < best.conflicts) best = ind;
    });
    setColoring(best.coloring);
    addLog(`Initial Best Conflicts: ${best.conflicts}`, 'info', best.conflicts);

    if (best.conflicts === 0) {
        addLog('Optimal solution found in initialization!', 'success', 0);
        setIsRunning(false);
        return;
    }

    // Loop with interval for animation
    simulationInterval.current = window.setInterval(() => {
        if (heaIterRef.current >= params.maxIterHEA) {
            stopHEA("Max iterations reached.");
            return;
        }

        const { newPopulation, best, bestConflicts, logs: stepLogs } = runHEAStep(populationRef.current, graph, params);
        
        populationRef.current = newPopulation;
        setColoring(best);
        stepLogs.forEach(l => addLog(l, 'info', bestConflicts));
        
        heaIterRef.current += 1;

        if (bestConflicts === 0) {
            stopHEA("Optimal solution found!");
        }

    }, 200); // 200ms delay per generation
  };

  const stopHEA = (reason: string) => {
    if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
        simulationInterval.current = null;
    }
    setIsRunning(false);
    addLog(`HEA Stopped: ${reason}`, 'success');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <PythonCodeModal isOpen={isPythonModalOpen} onClose={() => setIsPythonModalOpen(false)} />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <Dna className="w-8 h-8 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-800">Graph Coloring <span className="text-indigo-600">HEA Visualizer</span></h1>
        </div>
        <div className="flex items-center space-x-4">
            <button 
                onClick={() => setIsPythonModalOpen(true)}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-indigo-600 font-medium transition-colors"
            >
                <FileCode className="w-4 h-4" />
                <span>View Python Code</span>
            </button>
            <div className="text-sm text-gray-400 border-l pl-4 border-gray-200">
                v1.0.2
            </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar Controls */}
        <aside className="w-96 bg-white border-r border-gray-200 overflow-y-auto p-6 space-y-8 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
            
            {/* Graph Generation */}
            <section>
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center">
                    <Plus className="w-4 h-4 mr-2" /> Graph Generation
                </h2>
                <div className="space-y-4">
                    <div className="flex space-x-2 p-1 bg-gray-100 rounded-lg">
                        <button 
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${genType === 'random' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setGenType('random')}
                        >
                            Random
                        </button>
                        <button 
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${genType === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setGenType('manual')}
                        >
                            Manual
                        </button>
                    </div>

                    {genType === 'random' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Nodes</label>
                                <input 
                                    type="number" 
                                    value={numNodes} 
                                    onChange={(e) => setNumNodes(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Edge Prob.</label>
                                <input 
                                    type="number" 
                                    step="0.1" 
                                    max="1" 
                                    min="0"
                                    value={probEdges} 
                                    onChange={(e) => setProbEdges(parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Edges format: ((u,v), ...)</label>
                            <textarea 
                                value={manualEdges}
                                onChange={(e) => setManualEdges(e.target.value)}
                                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    )}
                    
                    <button 
                        onClick={handleGenerateGraph}
                        disabled={isRunning}
                        className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Generate Graph
                    </button>
                </div>
            </section>

            <hr className="border-gray-100" />

            {/* Algorithm Params */}
            <section>
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center">
                    <Activity className="w-4 h-4 mr-2" /> Algorithm Parameters
                </h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Colors (k)</label>
                        <input type="number" value={params.k} onChange={(e) => setParams({...params, k: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Pop Size (p)</label>
                        <input type="number" value={params.popSize} onChange={(e) => setParams({...params, popSize: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tabu Tenure</label>
                        <input type="number" value={params.tabuTenure} onChange={(e) => setParams({...params, tabuTenure: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                    <div>
                         <label className="block text-xs font-medium text-gray-700 mb-1">Max Iter (HEA)</label>
                         <input type="number" value={params.maxIterHEA} onChange={(e) => setParams({...params, maxIterHEA: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                </div>
            </section>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
                <button 
                    onClick={() => runAlgorithm('DSATUR')}
                    disabled={isRunning}
                    className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none disabled:opacity-50"
                >
                    Run DSATUR (Greedy)
                </button>
                <button 
                    onClick={() => runAlgorithm('TabuCol')}
                    disabled={isRunning}
                    className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none disabled:opacity-50"
                >
                    Run TabuCol (Local Search)
                </button>
                <button 
                    onClick={() => runAlgorithm('HEA')}
                    disabled={isRunning}
                    className={`w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                >
                    {isRunning ? 'Stop Algorithm' : <><Play className="w-4 h-4 mr-2" /> Run HEA (Evolutionary)</>}
                </button>
            </div>

        </aside>

        {/* Visualizer Area */}
        <main className="flex-1 flex flex-col bg-gray-50 relative">
            <div className="absolute top-4 right-4 z-20 flex space-x-2">
                <div className="bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm text-xs font-medium border border-gray-200">
                    Nodes: {graph.nodes.length}
                </div>
                <div className="bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm text-xs font-medium border border-gray-200">
                    Edges: {graph.links.length}
                </div>
            </div>

            <div className="flex-1 p-6 flex flex-col min-h-0">
                <GraphVisualizer data={graph} coloring={coloring} />
            </div>

            {/* Logs Terminal */}
            <div className="h-48 bg-gray-900 text-gray-300 p-4 overflow-y-auto font-mono text-xs border-t border-gray-800">
                {logs.length === 0 && <div className="text-gray-500 italic">Logs will appear here...</div>}
                {logs.slice().reverse().map((log, i) => (
                    <div key={log.step + i} className={`mb-1 ${
                        log.type === 'success' ? 'text-green-400' : 
                        log.type === 'error' ? 'text-red-400' : 
                        log.conflicts === 0 ? 'text-yellow-300 font-bold' : ''
                    }`}>
                        <span className="opacity-50">[{new Date(log.step).toLocaleTimeString()}]</span> {log.message}
                    </div>
                ))}
            </div>
        </main>
      </div>
    </div>
  );
}

export default App;
