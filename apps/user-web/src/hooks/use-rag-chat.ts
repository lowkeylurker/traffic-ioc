'use client';

import { useState, useCallback, useRef } from 'react';
import type { LegalCitation, VehicleType } from '@traffic-ioc/shared';

export interface SSEEvent {
  event: string;
  data: string;
}

export interface SSEHandlers {
  onCitations?: (citations: LegalCitation[]) => void;
  onToken?: (token: string) => void;
  onDone?: (payload: { messageId?: string; sessionId?: string }) => void;
  onError?: (error: string) => void;
}

/**
 * Parses raw text buffer into structured SSE events and remaining unfinished chunk
 */
export function parseSSEEvents(buffer: string): { events: SSEEvent[]; remainingBuffer: string } {
  const events: SSEEvent[] = [];
  const blocks = buffer.split('\n\n');
  const remainingBuffer = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = 'message';
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      events.push({
        event: eventType,
        data: dataLines.join('\n'),
      });
    }
  }

  return { events, remainingBuffer };
}

/**
 * Processes an async iterable stream of text chunks emitting parsed SSE callbacks
 */
export async function processSSEStream(
  stream: AsyncIterable<string>,
  handlers: SSEHandlers
): Promise<void> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk;
    const { events, remainingBuffer } = parseSSEEvents(buffer);
    buffer = remainingBuffer;

    for (const sseEvent of events) {
      try {
        const payload = JSON.parse(sseEvent.data);
        switch (sseEvent.event) {
          case 'citations':
            if (payload.citations && handlers.onCitations) {
              handlers.onCitations(payload.citations);
            }
            break;
          case 'token':
            if (payload.token !== undefined && handlers.onToken) {
              handlers.onToken(payload.token);
            }
            break;
          case 'done':
            if (handlers.onDone) {
              handlers.onDone({
                messageId: payload.messageId,
                sessionId: payload.sessionId,
              });
            }
            break;
          case 'error':
            if (handlers.onError) {
              handlers.onError(payload.error || 'Unknown streaming error');
            }
            break;
        }
      } catch (err) {
        console.error('Failed to parse SSE JSON payload:', err, sseEvent.data);
      }
    }
  }
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: LegalCitation[];
  messageId?: string;
  status?: 'sending' | 'streaming' | 'done' | 'error';
  timestamp?: number;
  error?: string;
}

export interface UseRagChatOptions {
  initialSessionId?: string | null;
  apiBaseUrl?: string;
}

export interface UseRagChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sessionId: string | null;
  vehicleFilter: VehicleType | null;
  setVehicleFilter: (filter: VehicleType | null) => void;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  stopStreaming: () => void;
}

/**
 * Custom React hook for real-time SSE Vietnamese Traffic Law RAG chat
 */
export function useRagChat(options: UseRagChatOptions = {}): UseRagChatReturn {
  const { initialSessionId = null, apiBaseUrl = '' } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [vehicleFilter, setVehicleFilter] = useState<VehicleType | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  }, []);

  const clearChat = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setError(null);
    setSessionId(null);
  }, [stopStreaming]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;

      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: trimmed,
        status: 'done',
        timestamp: Date.now(),
      };

      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        citations: [],
        status: 'streaming',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsLoading(true);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const endpoint = `${apiBaseUrl}/api/v1/rag/traffic-law/chat`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: trimmed,
            sessionId: sessionId || undefined,
            vehicleFilter: vehicleFilter || undefined,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Yêu cầu thất bại (${response.status})`);
        }

        if (!response.body) {
          throw new Error('ReadableStream không được hỗ trợ trên trình duyệt này');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        async function* streamChunks() {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              yield decoder.decode(value, { stream: true });
            }
          }
        }

        await processSSEStream(streamChunks(), {
          onCitations: (citations) => {
            setIsLoading(false);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, citations } : msg
              )
            );
          },
          onToken: (token) => {
            setIsLoading(false);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + token }
                  : msg
              )
            );
          },
          onDone: ({ messageId, sessionId: returnedSessionId }) => {
            if (returnedSessionId) {
              setSessionId(returnedSessionId);
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, messageId, status: 'done' }
                  : msg
              )
            );
          },
          onError: (streamErr) => {
            setError(streamErr);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, status: 'error', error: streamErr }
                  : msg
              )
            );
          },
        });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, status: 'done' } : msg
            )
          );
        } else {
          const errMsg = err.message || 'Lỗi trong quá trình kết nối với trợ lý';
          setError(errMsg);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, status: 'error', error: errMsg }
                : msg
            )
          );
        }
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [apiBaseUrl, isStreaming, sessionId, vehicleFilter]
  );

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    sessionId,
    vehicleFilter,
    setVehicleFilter,
    sendMessage,
    clearChat,
    stopStreaming,
  };
}
