import React from 'react';
import { X, Copy, Check, Terminal } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PythonCodeModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const pythonCode = `# Importations nécessaires
import random
import networkx as nx
import matplotlib.pyplot as plt
from collections import defaultdict
import ast
import sys
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QGroupBox, QFormLayout, 
    QLineEdit, QPushButton, QTextEdit, QComboBox, QMessageBox, QProgressBar
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure

# --- ALGORITHMES (Logic Only) ---

def dsatur_modifie(G, k, alpha=None):
    # Conversion si nécessaire
    if hasattr(G, 'nodes'):
        adj = {node: list(G.neighbors(node)) for node in G.nodes()}
        nodes = list(G.nodes())
    else:
        adj = G
        nodes = list(G.keys())
    
    # Init
    S = {v: 0 for v in nodes} # 0 = None
    sat = {v: 0 for v in nodes}
    degrees = {v: len(adj[v]) for v in nodes}
    
    # 1. Choisir sommet degré max
    v_star = max(nodes, key=lambda v: degrees[v])
    S[v_star] = 1
    
    colored_count = 1
    
    while colored_count < len(nodes):
        # Mise à jour saturation
        # Optimisation: on pourrait mettre à jour seulement les voisins, 
        # mais recalculer est plus sûr pour la demo
        for v in nodes:
            if S[v] == 0:
                neighbor_colors = set()
                for u in adj[v]:
                    if S[u] != 0:
                        neighbor_colors.add(S[u])
                sat[v] = len(neighbor_colors)
        
        # Choisir sommet non colorié avec sat max, puis degre max
        uncolored = [v for v in nodes if S[v] == 0]
        # Tri: Saturation DESC, Degré DESC
        uncolored.sort(key=lambda v: (sat[v], degrees[v]), reverse=True)
        
        target = uncolored[0]
        
        # Trouver plus petite couleur dispo
        neighbor_colors = set(S[u] for u in adj[target] if S[u] != 0)
        c = 1
        while c in neighbor_colors:
            c += 1
            
        # Si c > k, on force une couleur aléatoire ou la moins conflictuelle pour HEA
        if c > k:
            # Heuristique: choisir couleur minimisant conflits
            counts = {i: 0 for i in range(1, k+1)}
            for u in adj[target]:
                if S[u] != 0 and S[u] <= k:
                    counts[S[u]] += 1
            c = min(counts, key=counts.get)
            
        S[target] = c
        colored_count += 1
        
    return S

def compute_conflicts(G, S):
    conflicts = 0
    for u, v in G.edges():
        if S[u] == S[v] and S[u] != 0:
            conflicts += 1
    return conflicts # Pas divisé par 2 si on itère sur les arêtes directement

def tabucol(G, k, t, max_iter, S_init=None):
    # Initialisation
    if S_init:
        S = S_init.copy()
    else:
        S = {v: random.randint(1, k) for v in G.nodes()}
        
    # S'assurer que S est valide (pas de couleur > k ou 0)
    for v in S:
        if S[v] < 1 or S[v] > k:
            S[v] = random.randint(1, k)

    best_S = S.copy()
    current_conflicts = compute_conflicts(G, S)
    best_conflicts = current_conflicts
    
    # Matrice Tabou: tabu_matrix[noeud][couleur] = iteration_jusqu'a_laquelle_interdit
    tabu_matrix = defaultdict(lambda: defaultdict(int))
    
    for it in range(max_iter):
        if best_conflicts == 0:
            break
            
        # Identifier sommets en conflit
        conflicted_nodes = []
        for u, v in G.edges():
            if S[u] == S[v]:
                conflicted_nodes.extend([u, v])
        conflicted_nodes = list(set(conflicted_nodes))
        
        if not conflicted_nodes:
            break
            
        # Trouver meilleur mouvement (1-move)
        best_move = None # (node, old_c, new_c, delta)
        best_delta = float('inf')
        
        # On ne regarde que les voisins des sommets en conflit (simplification TabuCol)
        # Pour être efficace, on teste de changer la couleur d'un sommet en conflit
        candidates = conflicted_nodes
        
        # Pour limiter le temps de calcul, on peut prendre un sous-ensemble si trop grand
        if len(candidates) > 50:
            candidates = random.sample(candidates, 50)
            
        for u in candidates:
            old_c = S[u]
            current_local_conflicts = 0
            for neighbor in G.neighbors(u):
                if S[neighbor] == old_c:
                    current_local_conflicts += 1
            
            for new_c in range(1, k+1):
                if new_c == old_c: continue
                
                # Delta = nouveaux conflits - anciens conflits pour ce noeud
                new_local_conflicts = 0
                for neighbor in G.neighbors(u):
                    if S[neighbor] == new_c:
                        new_local_conflicts += 1
                
                delta = new_local_conflicts - current_local_conflicts
                
                # Aspiration ou non tabou
                is_tabu = tabu_matrix[u][new_c] > it
                is_aspiration = (current_conflicts + delta < best_conflicts)
                
                if not is_tabu or is_aspiration:
                    if delta < best_delta:
                        best_delta = delta
                        best_move = (u, old_c, new_c, delta)
                    elif delta == best_delta and random.random() < 0.5:
                        best_move = (u, old_c, new_c, delta)
        
        if best_move:
            u, old_c, new_c, delta = best_move
            S[u] = new_c
            current_conflicts += delta
            tabu_matrix[u][old_c] = it + t
            
            if current_conflicts < best_conflicts:
                best_conflicts = current_conflicts
                best_S = S.copy()
        else:
            # Blocage (tous tabou): mouvement aléatoire
            u = random.choice(candidates)
            S[u] = random.randint(1, k)
            current_conflicts = compute_conflicts(G, S)

    return best_conflicts, best_S

def gpx(G, p1, p2, k):
    # Groupement par classes de couleurs
    def get_classes(coloring):
        c = defaultdict(set)
        for v, col in coloring.items():
            c[col].add(v)
        return c

    c1 = get_classes(p1)
    c2 = get_classes(p2)
    
    child = {}
    remaining_nodes = set(G.nodes())
    
    current_parent = 1
    
    for c in range(1, k + 1):
        if not remaining_nodes: break
        
        # Choisir la classe du parent courant qui couvre le plus de noeuds restants
        classes = c1 if current_parent == 1 else c2
        
        best_color_class = -1
        max_covered = -1
        
        for col, nodes in classes.items():
            covered = len(nodes.intersection(remaining_nodes))
            if covered > max_covered:
                max_covered = covered
                best_color_class = col
        
        if best_color_class != -1:
            nodes_to_color = classes[best_color_class].intersection(remaining_nodes)
            for node in nodes_to_color:
                child[node] = c
                remaining_nodes.remove(node)
        
        # Alterner parent
        current_parent = 2 if current_parent == 1 else 1

    # Remplir les vides au hasard
    for node in remaining_nodes:
        child[node] = random.randint(1, k)
        
    return child

def HEA(G, k, p_size, max_iter, alpha, t, max_iter_tabu):
    # Init Population
    population = [] # Liste de (coloring, conflicts)
    
    for i in range(p_size):
        # Init gloutonne
        s_init = dsatur_modifie(G, k, alpha)
        # Amélioration locale rapide
        f, s = tabucol(G, k, t, max_iter_tabu, s_init)
        population.append((s, f))
        
    best_S = min(population, key=lambda x: x[1])[0]
    best_f = min(population, key=lambda x: x[1])[1]
    
    for it in range(max_iter):
        if best_f == 0: break
        
        # Selection parents (Tournoi)
        def tournament():
            opts = random.sample(population, min(3, len(population)))
            return min(opts, key=lambda x: x[1])[0]
            
        p1 = tournament()
        p2 = tournament()
        
        # Croisement
        child_init = gpx(G, p1, p2, k)
        
        # Amélioration
        child_f, child_S = tabucol(G, k, t, max_iter_tabu, child_init)
        
        # Remplacement du pire
        worst_idx = -1
        worst_f = -1
        for i, (s, f) in enumerate(population):
            if f > worst_f:
                worst_f = f
                worst_idx = i
                
        if child_f < worst_f:
            population[worst_idx] = (child_S, child_f)
            
        # Update best
        if child_f < best_f:
            best_f = child_f
            best_S = child_S

    return best_S, best_f

# --- INTERFACE GRAPHIQUE (PyQt5) ---

class ComputationThread(QThread):
    finished = pyqtSignal(dict, int)

    def __init__(self, G, k, p, max_iter_hea, alpha, t, max_iter_tabucol):
        super().__init__()
        self.params = (G, k, p, max_iter_hea, alpha, t, max_iter_tabucol)

    def run(self):
        solution, conflits = HEA(*self.params)
        self.finished.emit(solution, conflits)

class GraphColoringApp(QWidget):
    def __init__(self):
        super().__init__()
        self.G = None
        self.solution = None
        self.initUI()

    def initUI(self):
        self.setWindowTitle("HEA Coloration Graphe")
        self.setGeometry(100, 100, 900, 700)
        
        main_layout = QVBoxLayout()
        
        # Contrôles
        controls = QGroupBox("Configuration")
        form = QFormLayout()
        
        self.nb_nodes = QLineEdit("15")
        form.addRow("Sommets:", self.nb_nodes)
        
        self.prob = QLineEdit("0.3")
        form.addRow("Probabilité Arc:", self.prob)
        
        self.gen_btn = QPushButton("Générer Graphe")
        self.gen_btn.clicked.connect(self.generate_graph)
        form.addRow(self.gen_btn)
        
        self.k_input = QLineEdit("3")
        form.addRow("Couleurs (k):", self.k_input)
        
        self.run_btn = QPushButton("Lancer HEA")
        self.run_btn.clicked.connect(self.run_hea)
        form.addRow(self.run_btn)
        
        controls.setLayout(form)
        main_layout.addWidget(controls)
        
        # Canvas Matplotlib
        self.figure = Figure()
        self.canvas = FigureCanvas(self.figure)
        main_layout.addWidget(self.canvas)
        
        self.status = QProgressBar()
        main_layout.addWidget(self.status)
        
        self.setLayout(main_layout)
        
    def generate_graph(self):
        try:
            n = int(self.nb_nodes.text())
            p = float(self.prob.text())
            self.G = nx.erdos_renyi_graph(n, p)
            # Layout calculé une fois
            self.pos = nx.spring_layout(self.G)
            self.solution = None
            self.draw_graph()
        except Exception as e:
            QMessageBox.critical(self, "Erreur", str(e))
            
    def draw_graph(self):
        self.figure.clear()
        ax = self.figure.add_subplot(111)
        
        node_colors = []
        if self.solution:
            palette = ['#dddddd', '#ff6b6b', '#4d96ff', '#6bcb77', 
                       '#f7b801', '#9d4edd', '#ff922b', '#118ab2']
            for node in self.G.nodes():
                c = self.solution.get(node, 0)
                node_colors.append(palette[c % len(palette)])
        else:
            node_colors = '#dddddd'
            
        nx.draw(self.G, self.pos, ax=ax, with_labels=True, 
                node_color=node_colors, edge_color='#555555')
        self.canvas.draw()
        
    def run_hea(self):
        if not self.G: return
        self.status.setRange(0, 0) # Loading
        
        k = int(self.k_input.text())
        # Paramètres par défaut pour la demo
        self.thread = ComputationThread(
            self.G, k, p=10, max_iter_hea=50, 
            alpha=2, t=5, max_iter_tabucol=20
        )
        self.thread.finished.connect(self.on_finished)
        self.thread.start()
        
    def on_finished(self, solution, conflicts):
        self.status.setRange(0, 100)
        self.status.setValue(100)
        self.solution = solution
        QMessageBox.information(self, "Terminé", f"Conflits: {conflicts}")
        self.draw_graph()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = GraphColoringApp()
    w.show()
    sys.exit(app.exec_())
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
             <div className="bg-indigo-100 p-2 rounded-lg">
                <Terminal className="w-5 h-5 text-indigo-600" />
             </div>
             <div>
                <h2 className="text-lg font-bold text-gray-800">Python Source Code</h2>
                <p className="text-xs text-gray-500">Corrected PyQt5 + NetworkX Implementation</p>
             </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                copied 
                  ? 'bg-green-100 text-green-700 border border-green-200' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Setup Info */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex items-center space-x-4 text-xs font-mono text-gray-600">
            <span className="font-bold text-gray-500 select-none">INSTALL:</span>
            <code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800 select-all">pip install networkx matplotlib PyQt5</code>
            <span className="text-gray-300">|</span>
            <span className="font-bold text-gray-500 select-none">RUN:</span>
            <code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800 select-all">python main.py</code>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-0 bg-[#1e1e1e]">
          <pre className="p-6 text-sm font-mono leading-relaxed text-gray-300 selection:bg-indigo-500/30">
            <code>{pythonCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export default PythonCodeModal;