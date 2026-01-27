import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { WordEntry, SimulationNode } from '../types';

interface WordCloudChartProps {
  data: WordEntry[];
}

const WordCloudChart: React.FC<WordCloudChartProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Handle Resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 400,
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // D3 Logic
  useEffect(() => {
    // 1. Always clear previous render first to prevent ghosting when data is empty
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // 2. Check conditions. If no data, we stop here (leaving a clean SVG)
    if (!dimensions.width || !dimensions.height || data.length === 0) return;

    const width = dimensions.width;
    const height = dimensions.height;

    // Scales
    const maxCount = d3.max(data, (d: WordEntry) => d.count) || 1;
    const minCount = d3.min(data, (d: WordEntry) => d.count) || 1;

    const sizeScale = d3.scaleLinear()
      .domain([minCount, maxCount])
      .range([16, 56]); // Increased font size range slightly for better readability

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Prepare nodes
    const nodes: SimulationNode[] = data.map(d => ({
      ...d,
      r: sizeScale(d.count) * 1.5, // radius is roughly font size based
      x: width / 2 + (Math.random() - 0.5) * 50,
      y: height / 2 + (Math.random() - 0.5) * 50,
    }));

    // Simulation
    const simulation = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(5)) // Positive charge (attraction) helps cluster
      .force("x", d3.forceX(width / 2).strength(0.05)) // Gravity to X center
      .force("y", d3.forceY(height / 2).strength(0.05)) // Gravity to Y center
      .force("collide", d3.forceCollide().radius((d: any) => d.r + 2).iterations(3));

    // Render group
    const g = svg.append("g");

    // Create node elements (groups with circle and text)
    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2) // Thicker stroke for better separation
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(drag(simulation) as any);

    // Optional: Add circles behind text for better readability/bubble effect
    node.append("circle")
      .attr("r", d => d.r)
      .attr("fill", (d, i) => colorScale(i.toString()))
      .attr("opacity", 0.1)
      .attr("stroke", (d, i) => colorScale(i.toString()))
      .attr("stroke-width", 1);

    // Add Text
    node.append("text")
      .text(d => d.text)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-family", "'Prompt', sans-serif") // Explicitly set font
      .attr("font-size", d => `${sizeScale(d.count)}px`)
      .attr("font-weight", "500") // Slightly lighter weight for Promt to look clean
      .attr("fill", (d, i) => d3.color(colorScale(i.toString()))?.darker(1)?.toString() || "#333")
      .style("cursor", "grab")
      .style("user-select", "none")
      .style("text-shadow", "0px 1px 3px rgba(255,255,255,0.8)"); // Add subtle text shadow for readability

    // Tick function
    simulation.on("tick", () => {
      // Constraints to keep inside SVG
      node.attr("transform", d => {
        const r = d.r;
        // Bounding box constraint
        d.x = Math.max(r, Math.min(width - r, d.x || 0));
        d.y = Math.max(r, Math.min(height - r, d.y || 0));
        return `translate(${d.x},${d.y})`;
      });
    });

    // Cleanup
    return () => {
      simulation.stop();
    };

  }, [data, dimensions]);

  // Drag behavior
  const drag = (simulation: d3.Simulation<SimulationNode, undefined>) => {
    function dragstarted(event: any, d: SimulationNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: SimulationNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: SimulationNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  return (
    <div ref={containerRef} className="w-full h-[50vh] min-h-[400px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 z-10">
          <p className="font-medium">ยังไม่มีคำตอบ ส่งคำตอบแรกกันเลย!</p>
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default WordCloudChart;