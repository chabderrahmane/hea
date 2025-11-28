import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphData, Coloring } from '../types';

interface Props {
  data: GraphData;
  coloring: Coloring;
  width?: number;
  height?: number;
}

// Fixed color palette
const PALETTE = [
  "#e5e7eb", // 0: uncolored (gray-200)
  "#ef4444", // 1: red-500
  "#3b82f6", // 2: blue-500
  "#22c55e", // 3: green-500
  "#eab308", // 4: yellow-500
  "#a855f7", // 5: purple-500
  "#f97316", // 6: orange-500
  "#06b6d4", // 7: cyan-500
  "#ec4899", // 8: pink-500
  "#84cc16", // 9: lime-500
  "#6366f1", // 10: indigo-500
];

const GraphVisualizer: React.FC<Props> = ({ data, coloring, width = 600, height = 400 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous

    const containerWidth = svgRef.current.clientWidth;
    const containerHeight = svgRef.current.clientHeight;

    // Simulation setup
    const simulation = d3.forceSimulation(data.nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(data.links).id((d: any) => d.id).distance(60))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(containerWidth / 2, containerHeight / 2))
      .force("collide", d3.forceCollide().radius(20));

    // Draw lines
    const link = svg.append("g")
      .attr("stroke", "#9ca3af")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke-width", 2);

    // Draw nodes
    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("r", 15)
      .call((d3.drag() as any)
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Draw labels
    const labels = svg.append("g")
      .attr("class", "texts")
      .selectAll("text")
      .data(data.nodes)
      .join("text")
      .text(d => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .style("fill", "#1f2937") // text-gray-800
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .style("pointer-events", "none");

    // Update function
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);
        
      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data]); // Re-run if graph structure changes

  // Separate effect for coloring updates only (performance)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll("circle")
      .transition().duration(300)
      .attr("fill", (d: any) => {
        const c = coloring[d.id] || 0;
        return PALETTE[c % PALETTE.length];
      });
      
    svg.selectAll("text")
       .transition().duration(300)
       .style("fill", (d: any) => {
           const c = coloring[d.id] || 0;
           // If color is dark, make text white, else black. Simplified:
           // 1(red), 2(blue), 3(green), 5(purple), 6(orange) -> white text
           // 4(yellow), 7(cyan), 8(pink), 9(lime) -> black text roughly
           if ([1, 2, 3, 5, 6, 10].includes(c % PALETTE.length)) return "#ffffff";
           return "#1f2937";
       });
       
  }, [coloring]);

  return (
    <div className="w-full h-full border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <svg ref={svgRef} className="w-full h-full" style={{minHeight: '500px'}}></svg>
    </div>
  );
};

export default GraphVisualizer;
