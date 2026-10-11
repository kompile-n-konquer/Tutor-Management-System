import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PriorityPanel from './PriorityPanel.jsx';

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <PriorityPanel {...props} />
    </MemoryRouter>,
  );

const item = (overrides = {}) => ({
  id: 'swap-1',
  type: 'swap-incoming',
  severity: 'urgent',
  title: 'Cover swap from Riya Naidoo',
  detail: 'CS101 on 2026-10-14 — waiting for your response',
  at: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...overrides,
});

describe('PriorityPanel — the attention feed', () => {
  test('shows skeleton rows while the first load is in flight', () => {
    const { container } = renderPanel({ isLoading: true });

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cover swap from Riya Naidoo')).not.toBeInTheDocument();
  });

  test('shows the load error with a retry button', () => {
    const onRetry = vi.fn();
    renderPanel({ loadError: 'Could not load your dashboard items.', onRetry });

    expect(screen.getByText('Could not load your dashboard items.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('reassures when the feed is empty', () => {
    renderPanel();

    expect(screen.getByText(/You’re all caught up/i)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  test('renders urgent items first with their action links, then the info tail', () => {
    renderPanel({
      items: [
        item(),
        item({ id: 'info-1', type: 'timesheet-draft', severity: 'info', title: 'Draft timesheet "Week 5" has unsubmitted hours' }),
        item({ id: 'urgent-2', type: 'timesheet-rejected', severity: 'urgent', title: 'Timesheet "Week 4" was rejected' }),
      ],
    });

    // Both sections render, and the urgent list carries the two urgent rows.
    expect(screen.getByText('For your information')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Respond' })).toHaveAttribute('href', '/swaps');
    expect(screen.getByRole('link', { name: 'Fix timesheet' })).toHaveAttribute(
      'href',
      '/timesheets',
    );
    expect(screen.getByRole('link', { name: 'Submit hours' })).toHaveAttribute(
      'href',
      '/timesheets',
    );
    // Urgent rows keep the orange accent; info rows do not.
    const urgentRow = screen.getByText('Timesheet "Week 4" was rejected').closest('li');
    const infoRow = screen.getByText(/Draft timesheet/).closest('li');
    expect(urgentRow.className).toContain('border-urgent-orange');
    expect(infoRow.className).not.toContain('border-urgent-orange');
  });

  test('shows relative freshness and the last-updated time', () => {
    renderPanel({
      items: [item()],
      lastRefreshedAt: '2026-10-11T09:30:00.000Z',
    });

    expect(screen.getByText('5m ago')).toBeInTheDocument();
    expect(screen.getByText(/Live · updated/i)).toBeInTheDocument();
  });

  test('future timestamps (upcoming sessions) render the calendar date, not "just now"', () => {
    const upcoming = new Date(Date.now() + 3 * 86_400_000);
    renderPanel({
      items: [
        item({
          id: 'session-9',
          type: 'cover-awaiting',
          title: 'Your CS101 session needs a cover',
          at: upcoming.toISOString(),
        }),
      ],
    });

    expect(screen.getByText(upcoming.toLocaleDateString())).toBeInTheDocument();
    expect(screen.queryByText('just now')).not.toBeInTheDocument();
  });

  test('a cover-decision item anchors to the courses on this page', () => {
    renderPanel({
      items: [
        item({
          id: 'session-21',
          type: 'cover-decision',
          title: 'Riya Naidoo volunteered to cover CS101',
        }),
      ],
    });

    const anchor = screen.getByRole('link', { name: 'Decide below' });
    expect(anchor).toHaveAttribute('href', '#lecturer-courses');
    expect(anchor.tagName).toBe('A');
  });

  test('items without a mapped action render no link', () => {
    renderPanel({
      items: [item({ id: 'mystery', type: 'brand-new-item', title: 'Something novel' })],
    });

    expect(screen.getByText('Something novel')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('items without a timestamp show no freshness column', () => {
    renderPanel({
      items: [item({ id: 'swap-2', at: null })],
    });

    expect(screen.queryByText('5m ago')).not.toBeInTheDocument();
    expect(screen.queryByText('just now')).not.toBeInTheDocument();
  });
});
