'use client';

import React from 'react';
import { BookOpen, ChevronRight, FileText, Scale } from 'lucide-react';
import type { LegalCitation } from '@traffic-ioc/shared';
import { cn } from '@/lib/utils';

export interface CitationCardProps {
  citation: LegalCitation;
  onClick?: (citation: LegalCitation) => void;
  className?: string;
}

export function CitationCard({ citation, onClick, className }: CitationCardProps) {
  const { docCode, articleNumber, clauseNumber, pointCode, breadcrumb, title } = citation;

  const clauseStr = clauseNumber ? `Khoản ${clauseNumber}` : '';
  const pointStr = pointCode ? `Điểm ${pointCode}` : '';
  const detailParts = [clauseStr, pointStr].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      onClick={() => onClick?.(citation)}
      className={cn(
        'group flex w-full items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-2.5 text-left transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-xs active:scale-[0.99] cursor-pointer',
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
          <BookOpen className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-blue-900">
            <span className="rounded bg-blue-100/80 px-1.5 py-0.5 text-[11px] font-bold text-blue-800">
              {docCode}
            </span>
            <span>Điều {articleNumber}</span>
            {detailParts && <span className="text-slate-600 font-normal">({detailParts})</span>}
          </div>
          {breadcrumb ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{breadcrumb}</p>
          ) : title ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{title}</p>
          ) : null}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600 transition-colors" />
    </button>
  );
}
