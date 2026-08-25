'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, CornerDownLeft, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PromptInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const SUGGESTED_PROMPTS = [
  'Mức phạt vượt đèn đỏ xe máy',
  'Nồng độ cồn ô tô',
  'Không đội mũ bảo hiểm',
  'Đi ngược chiều trên cao tốc',
  'Chạy quá tốc độ quy định',
];

export function PromptInput({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder = 'Nhập câu hỏi về luật giao thông đường bộ, mức phạt, tình huống...',
}: PromptInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isStreaming) {
      onStop?.();
      return;
    }
    const trimmed = input.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePromptClick = (prompt: string) => {
    if (isStreaming || disabled) return;
    onSend(prompt);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Quick suggested prompt pills */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <Sparkles className="h-3 w-3 text-amber-500" />
          Gợi ý:
        </span>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handlePromptClick(prompt)}
            disabled={isStreaming || disabled}
            className="cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-2xs transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Main input container */}
      <form
        onSubmit={handleSubmit}
        className="relative flex items-end rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-2 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-center gap-1.5 pb-1 pr-1">
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={onStop}
              className="h-8 w-8 rounded-xl shadow-xs"
              title="Dừng phản hồi"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="sr-only">Dừng phản hồi</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={disabled || !input.trim()}
              className="h-8 w-8 rounded-xl bg-blue-600 shadow-xs hover:bg-blue-700 disabled:opacity-40"
              title="Gửi câu hỏi"
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Gửi</span>
            </Button>
          )}
        </div>
      </form>
      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
        <span>Nhấn Enter để gửi, Shift + Enter để xuống dòng</span>
        <span className="hidden sm:inline-flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" /> Gửi tin nhắn
        </span>
      </div>
    </div>
  );
}
