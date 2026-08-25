import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FineCard, formatVndCurrency } from '../components/assistant/fine-card';

describe('FineCard Component & Currency Formatter', () => {
  describe('formatVndCurrency', () => {
    it('should format numbers into Vietnamese Dong format', () => {
      expect(formatVndCurrency(800000)).toBe('800.000đ');
      expect(formatVndCurrency(1000000)).toBe('1.000.000đ');
      expect(formatVndCurrency(0)).toBe('0đ');
    });
  });

  describe('FineCard Rendering', () => {
    it('should render fine range and suspension correctly', () => {
      render(
        <FineCard
          fineMin={800000}
          fineMax={1000000}
          suspensionMonths={2}
          title="Mức xử phạt ước tính"
        />
      );

      expect(screen.getByText(/800\.000đ - 1\.000\.000đ/i)).toBeDefined();
      expect(screen.getByText(/Tước GPLX: 2 tháng/i)).toBeDefined();
    });

    it('should render single fine value when fineMin equals fineMax', () => {
      render(<FineCard fineMin={500000} fineMax={500000} />);

      expect(screen.getByText(/500\.000đ/i)).toBeDefined();
    });

    it('should not render suspension section when suspensionMonths is null or 0', () => {
      const { container } = render(<FineCard fineMin={400000} fineMax={600000} />);

      expect(container.textContent).not.toContain('Tước GPLX');
    });
  });
});
