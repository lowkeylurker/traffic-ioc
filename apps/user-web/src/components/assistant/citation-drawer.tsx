'use client';

import React from 'react';
import { ExternalLink, FileText, Scale, ShieldCheck } from 'lucide-react';
import type { LegalCitation } from '@traffic-ioc/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FineCard } from './fine-card';

export interface CitationDrawerProps {
  citation: LegalCitation | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CitationDrawer({ citation, isOpen, onClose }: CitationDrawerProps) {
  if (!citation) return null;

  const {
    docCode,
    articleNumber,
    clauseNumber,
    pointCode,
    breadcrumb,
    fineMin,
    fineMax,
    suspensionMonths,
    title,
    sourceUrl,
    content,
  } = citation;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="gap-1 bg-blue-600">
              <Scale className="h-3 w-3" />
              {docCode}
            </Badge>
            <Badge variant="secondary">Điều {articleNumber}</Badge>
            {clauseNumber && <Badge variant="outline">Khoản {clauseNumber}</Badge>}
            {pointCode && <Badge variant="outline">Điểm {pointCode}</Badge>}
          </div>

          <DialogTitle className="text-xl font-bold text-slate-900">
            {title || `Văn bản quy phạm pháp luật: ${docCode}`}
          </DialogTitle>

          {breadcrumb && (
            <DialogDescription className="text-xs font-medium text-slate-500">
              {breadcrumb}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Fine & Penalty Summary Card */}
          {(fineMin || fineMax || suspensionMonths) && (
            <FineCard
              fineMin={fineMin}
              fineMax={fineMax}
              suspensionMonths={suspensionMonths}
            />
          )}

          {/* Full Legal Text Content */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>Nội dung điều khoản trích dẫn</span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {content || 'Chưa có nội dung chi tiết cho trích dẫn này.'}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between items-center">
          {sourceUrl ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full sm:w-auto gap-1.5 text-xs text-blue-600 hover:text-blue-700"
            >
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <span>Tra cứu trên Thư Viện Pháp Luật</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : (
            <div />
          )}

          <Button onClick={onClose} size="sm" className="w-full sm:w-auto">
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
