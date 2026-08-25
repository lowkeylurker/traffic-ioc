/**
 * TanStack Query Key Factory for Traffic Legislation RAG Assistant
 */
export const assistantKeys = {
  all: ['assistant'] as const,
  sessions: () => [...assistantKeys.all, 'sessions'] as const,
  session: (id: string) => [...assistantKeys.all, 'session', id] as const,
  chat: (sessionId?: string | null) =>
    [...assistantKeys.all, 'chat', sessionId ?? 'default'] as const,
  feedback: (messageId: string) =>
    [...assistantKeys.all, 'feedback', messageId] as const,
};
