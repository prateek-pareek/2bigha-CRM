"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";

export type VennSet = {
  label: string;
  value: number;
  color: string;
};

export type VennIntersection = {
  label: string;
  value: number;
};

interface CrmVennDiagramProps {
  setA: VennSet;
  setB: VennSet;
  intersection: VennIntersection;
  className?: string;
  height?: number;
}

export default function CrmVennDiagram({ setA, setB, intersection, className, height = 240 }: CrmVennDiagramProps) {
  const gradA = useId().replace(/:/g, "");
  const gradB = useId().replace(/:/g, "");

  // Fallbacks to avoid NaN
  const totalArea = Math.max(1, setA.value + setB.value - intersection.value);
  
  // Calculate relative sizes (clamped for visual aesthetics)
  const ratioA = Math.max(0.4, Math.min(1, setA.value / totalArea));
  const ratioB = Math.max(0.4, Math.min(1, setB.value / totalArea));

  const rA = 50 * ratioA;
  const rB = 50 * ratioB;

  // Overlap is fixed aesthetically, but we can adjust distance based on intersection
  const intersectRatio = intersection.value / Math.max(1, Math.min(setA.value, setB.value));
  // 1 = complete overlap, 0 = no overlap. Map this to center distance.
  const distance = 60 - (30 * intersectRatio);

  const cxA = 100 - (distance / 2);
  const cxB = 100 + (distance / 2);

  return (
    <div className={cn("relative w-full flex flex-col items-center justify-center", className)} style={{ minHeight: height }}>
      <svg viewBox="0 0 200 120" className="w-full max-w-[320px] h-auto overflow-visible drop-shadow-sm">
        <defs>
          <linearGradient id={gradA} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={setA.color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={setA.color} stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id={gradB} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={setB.color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={setB.color} stopOpacity={0.3} />
          </linearGradient>
        </defs>

        {/* Set A Circle */}
        <circle cx={cxA} cy="60" r={rA} fill={`url(#${gradA})`} className="mix-blend-multiply transition-all duration-700 ease-out" />
        
        {/* Set B Circle */}
        <circle cx={cxB} cy="60" r={rB} fill={`url(#${gradB})`} className="mix-blend-multiply transition-all duration-700 ease-out" />

        {/* Values inside */}
        {setA.value > intersection.value && (
          <text x={cxA - rA/2.5} y="60" textAnchor="middle" dominantBaseline="middle" fill={setA.color} className="text-[14px] font-black pointer-events-none drop-shadow-md">
            {setA.value - intersection.value}
          </text>
        )}
        
        {setB.value > intersection.value && (
          <text x={cxB + rB/2.5} y="60" textAnchor="middle" dominantBaseline="middle" fill={setB.color} className="text-[14px] font-black pointer-events-none drop-shadow-md">
            {setB.value - intersection.value}
          </text>
        )}

        {/* Intersection */}
        {intersection.value > 0 && (
          <text x="100" y="60" textAnchor="middle" dominantBaseline="middle" fill="#1e293b" className="text-[14px] font-black pointer-events-none drop-shadow-md">
            {intersection.value}
          </text>
        )}
      </svg>
      
      {/* Legend / Labels below SVG */}
      <div className="flex items-start justify-center gap-6 w-full mt-4 flex-wrap px-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: setA.color }} />
            <span className="text-[10px] font-bold text-text-muted">{setA.label}</span>
          </div>
          <span className="text-sm font-black text-text-main">{setA.value}</span>
        </div>
        
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 mix-blend-multiply opacity-70" />
            <span className="text-[10px] font-bold text-text-muted">{intersection.label}</span>
          </div>
          <span className="text-sm font-black text-text-main">{intersection.value}</span>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: setB.color }} />
            <span className="text-[10px] font-bold text-text-muted">{setB.label}</span>
          </div>
          <span className="text-sm font-black text-text-main">{setB.value}</span>
        </div>
      </div>
    </div>
  );
}
