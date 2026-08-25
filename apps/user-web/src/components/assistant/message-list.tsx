'use client';

import React, { useEffect, useRef } from 'react';
import { AlertCircle, Bot, Loader2, Scale, User } from 'lucide-react';
import type { LegalCitation } from '@traffic-ioc/shared';
import type { ChatMessage } from '@/hooks/use-rag-chat';
import { cn } from '@/lib/utils';
import { CitationCard } from './citation-card';
import { FineCard } from './fine-card';
import { FeedbackAction } from './feedback-action';

export interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onCitationClick: (citation: LegalCitation) => void;
  className?: string;
}

export function MessageList({
  messages,
  isStreaming,
  onCitationClick,
  className,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Scale className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-800">
          Trợ Lý Pháp Lý Giao Thông Sẵn Sàng Hỗ Trợ
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          Hãy nhập câu hỏi hoặc chọn một trong các câu hỏi mẫu bên dưới để tra cứu mức phạt vi phạm, điều khoản Nghị định 100/123 và quy tắc giao thông.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-5 overflow-y-auto p-4 sm:p-6', className)}>
      {messages.map((message) => {
        const isUser = message.role === 'user';
        const isAssistant = message.role === 'assistant';
        const citations = message.citations || [];

        // Check if there are fine info in citations
        const firstCitationWithFine = citations.find(
          (c) => c.fineMin || c.fineMax || c.suspensionMonths
        );

        return (
          <div
            key={message.id}
            className={cn(
              'flex gap-3',
              isUser ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold shadow-2xs',
                isUser
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-white'
              )}
            >
              {isUser ? <User className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
            </div>

            {/* Bubble Content */}
            <div
              className={cn(
                'flex max-w-[88%] sm:max-w-[80%] flex-col gap-3 rounded-2xl p-4 text-sm leading-relaxed shadow-2xs',
                isUser
                  ? 'bg-blue-600 text-white rounded-tr-xs'
                  : 'border border-slate-200 bg-white text-slate-900 rounded-tl-xs'
              )}
            >
              {/* Message text */}
              <div className="whitespace-pre-wrap">
                {message.content}
                {isAssistant && message.status === 'streaming' && !message.content && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    Đang tra cứu cơ sở dữ liệu pháp luật...
                  </span>
                )}
                {isAssistant && message.status === 'streaming' && message.content && (
                  <span className="inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-blue-600 ml-0.5" />
                )}
              </div>

              {/* Error indicator */}
              {message.status === 'error' && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{message.error || 'Có lỗi xảy ra khi xử lý phản hồi.'}</span>
                </div>
              )}

              {/* Fine summary card if fine info exists */}
              {isAssistant && firstCitationWithFine && (
                <FineCard
                  fineMin={firstCitationWithFine.fineMin}
                  fineMax={firstCitationWithFine.fineMax}
                  suspensionMonths={firstCitationWithFine.suspensionMonths}
                  className="mt-1"
                />
              )}

              {/* Citations List */}
              {isAssistant && citations.length > 0 && (
                <div className="mt-1 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Căn cứ pháp lý ({citations.length}):
                  </span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {citations.map((citation, idx) => (
                      <CitationCard
                        key={`${citation.docCode}-${citation.articleNumber}-${citation.clauseNumber ?? ''}-${idx}`}
                        citation={citation}
                        onClick={onCitationClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Message Feedback Action */}
              {isAssistant && message.status === 'done' && message.messageId && (
                <div className="mt-1 border-t border-slate-100 pt-2">
                  <FeedbackAction messageId={message.messageId} />
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
