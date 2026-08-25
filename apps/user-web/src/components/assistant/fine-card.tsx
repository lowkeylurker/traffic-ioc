'use client';

import React from 'react';
import { AlertCircle, Ban, Banknote, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface FineCardProps {
  fineMin?: number | null;
  fineMax?: number | null;
  suspensionMonths?: number | null;
  title?: string;
  className?: string;
}

/**
 * Formats integer VND numbers into Vietnamese currency format e.g. "800.000đ"
 */
export function formatVndCurrency(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`;
}

export function FineCard({
  fineMin,
  fineMax,
  suspensionMonths,
  title = 'Khung xử phạt tham khảo',
  className,
}: FineCardProps) {
  const hasFine = fineMin !== null && fineMin !== undefined;
  const hasSuspension = suspensionMonths !== null && suspensionMonths !== undefined && suspensionMonths > 0;

  if (!hasFine && !hasSuspension) {
    return null;
  }

  const formatRange = () => {
    if (fineMin !== null && fineMin !== undefined && fineMax !== null && fineMax !== undefined) {
      if (fineMin === fineMax) {
        return formatVndCurrency(fineMin);
      }
      return `${formatVndCurrency(fineMin)} - ${formatVndCurrency(fineMax)}`;
    }
    if (fineMin !== null && fineMin !== undefined) {
      return `Từ ${formatVndCurrency(fineMin)}`;
    }
    if (fineMax !== null && fineMax !== undefined) {
      return `Đến ${formatVndCurrency(fineMax)}`;
    }
    return '';
  };

  const isHighSeverity = (fineMax || fineMin || 0) >= 4000000;

  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 shadow-2xs transition-all',
        isHighSeverity
          ? 'border-red-200 bg-red-50/60 text-red-950'
          : 'border-amber-200 bg-amber-50/60 text-amber-950',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Banknote
            className={cn('h-4 w-4', isHighSeverity ? 'text-red-600' : 'text-amber-600')}
          />
          <span>{title}</span>
        </div>
        <Badge
          variant={isHighSeverity ? 'destructive' : 'warning'}
          className="text-[10px] uppercase tracking-wide"
        >
          {isHighSeverity ? 'Nghiêm trọng' : 'Quy định chuẩn'}
        </Badge>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        {hasFine && (
          <div className="text-base font-bold text-slate-900 sm:text-lg">
            {formatRange()}
          </div>
        )}

        {hasSuspension && (
          <div className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-red-700 shadow-2xs border border-red-200">
            <Ban className="h-3 w-3 text-red-500" />
            <span>Tước GPLX: {suspensionMonths} tháng</span>
          </div>
        )}
      </div>
    </div>
  );
}
