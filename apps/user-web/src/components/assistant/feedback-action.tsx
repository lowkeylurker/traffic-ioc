'use client';

import React, { useState } from 'react';
import { Check, MessageSquare, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FeedbackActionProps {
  messageId?: string;
  onFeedbackSubmitted?: (rating: number, comment?: string) => void;
  className?: string;
}

export function FeedbackAction({
  messageId,
  onFeedbackSubmitted,
  className,
}: FeedbackActionProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!messageId) {
    return null;
  }

  const submitFeedback = async (rating: number, customComment?: string) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/v1/rag/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          rating,
          comment: customComment?.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Gửi đánh giá không thành công');
      }

      setHasSubmitted(true);
      setShowCommentBox(false);
      onFeedbackSubmitted?.(rating, customComment);
    } catch (err: any) {
      setSubmitError(err.message || 'Lỗi gửi phản hồi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRatingClick = async (rating: number) => {
    if (hasSubmitted || isSubmitting) return;

    setSelectedRating(rating);

    if (rating === -1) {
      // Open comment box to ask for details on how to improve
      setShowCommentBox(true);
    } else {
      await submitFeedback(rating);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRating === null) return;
    await submitFeedback(selectedRating, comment);
  };

  if (hasSubmitted) {
    return (
      <div className={cn('flex items-center gap-1.5 text-xs text-emerald-600', className)}>
        <Check className="h-3.5 w-3.5" />
        <span>Cảm ơn bạn đã phản hồi!</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-slate-400">Câu trả lời hữu ích?</span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleRatingClick(1)}
          disabled={isSubmitting}
          aria-label="Hữu ích"
          className={cn(
            'h-7 px-2 text-xs text-slate-500 hover:text-blue-600 gap-1',
            selectedRating === 1 && 'text-blue-600 bg-blue-50'
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:inline-block">Hữu ích</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleRatingClick(-1)}
          disabled={isSubmitting}
          aria-label="Chưa chính xác"
          className={cn(
            'h-7 px-2 text-xs text-slate-500 hover:text-red-600 gap-1',
            selectedRating === -1 && 'text-red-600 bg-red-50'
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:inline-block">Chưa chính xác</span>
        </Button>
      </div>

      {showCommentBox && (
        <form
          onSubmit={handleCommentSubmit}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:max-w-md"
        >
          <label htmlFor="feedback-comment" className="text-xs font-medium text-slate-700">
            Giúp chúng tôi cải thiện câu trả lời (tùy chọn):
          </label>
          <textarea
            id="feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ví dụ: Mức phạt chưa đúng theo Nghị định mới nhất..."
            rows={2}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden"
          />

          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCommentBox(false);
                submitFeedback(-1);
              }}
              disabled={isSubmitting}
              className="h-7 text-xs text-slate-500"
            >
              Bỏ qua góp ý
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="h-7 gap-1 bg-blue-600 text-xs text-white hover:bg-blue-700"
            >
              <Send className="h-3 w-3" />
              Gửi
            </Button>
          </div>

          {submitError && <span className="text-[11px] text-red-500">{submitError}</span>}
        </form>
      )}
    </div>
  );
}
