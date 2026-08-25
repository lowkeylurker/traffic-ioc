import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CitationCard } from '../components/assistant/citation-card';
import type { LegalCitation } from '@traffic-ioc/shared';

describe('CitationCard Component', () => {
  const mockCitation: LegalCitation = {
    docCode: 'ND100/2019/ND-CP',
    articleNumber: 6,
    clauseNumber: 4,
    pointCode: 'a',
    breadcrumb: 'Điều 6 > Khoản 4 > Điểm a',
    fineMin: 800000,
    fineMax: 1000000,
    suspensionMonths: 2,
    title: 'Nghị định 100/2019/NĐ-CP',
    sourceUrl: 'https://thuvienphapluat.vn/van-ban/100-2019-ND-CP',
    content: 'Xử phạt người điều khiển xe mô tô, xe gắn máy vi phạm quy tắc giao thông đường bộ',
  };

  it('should render document code, article, and breadcrumb correctly', () => {
    render(<CitationCard citation={mockCitation} />);

    expect(screen.getByText(/ND100\/2019\/ND-CP/i)).toBeDefined();
    expect(screen.getByText(/Điều 6/i)).toBeDefined();
  });

  it('should trigger onClick callback with citation data when clicked', () => {
    const handleClick = vi.fn();
    render(<CitationCard citation={mockCitation} onClick={handleClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockCitation);
  });
});
