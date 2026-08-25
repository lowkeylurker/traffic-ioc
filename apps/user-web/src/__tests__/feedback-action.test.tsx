import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackAction } from '../components/assistant/feedback-action';

describe('FeedbackAction Component', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render thumbs up and thumbs down buttons when messageId is provided', () => {
    render(<FeedbackAction messageId={validUuid} />);

    expect(screen.getByRole('button', { name: /hữu ích/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /chưa chính xác/i })).toBeDefined();
  });

  it('should not render when messageId is not provided', () => {
    const { container } = render(<FeedbackAction messageId={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('should submit positive feedback via API and update UI state', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock as any;

    const onSubmitted = vi.fn();
    render(<FeedbackAction messageId={validUuid} onFeedbackSubmitted={onSubmitted} />);

    const upButton = screen.getByRole('button', { name: /hữu ích/i });
    fireEvent.click(upButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/rag/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: validUuid,
            rating: 1,
            comment: null,
          }),
        })
      );
      expect(onSubmitted).toHaveBeenCalledWith(1, undefined);
    });

    expect(screen.getByText(/cảm ơn bạn đã phản hồi/i)).toBeDefined();
  });
});
