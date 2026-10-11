import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPreview from './DashboardPreview.jsx';
import TimesheetsContent from '../../timesheets/TimesheetsContent.jsx';
import TutorDashboardContent from '../../tutor-dashboard/TutorDashboardContent.jsx';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const futureDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const session = (overrides = {}) => ({
  id: 'session-1',
  date: futureDate(2),
  status: 'SCHEDULED',
  course: { courseCode: 'COMS3005', courseName: 'Software Design' },
  courseSlot: { venue: 'Room 204', sessionType: 'Tutorial', timeSlot: { startMinute: 480, endMinute: 540 } },
  ...overrides,
});

describe('DashboardPreview', () => {
  test('switches among tutor, organiser, and lecturer previews', () => {
    renderWithRouter(<DashboardPreview />);

    expect(screen.getByRole('tab', { name: 'Tutor' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText("Alex's tutoring schedule")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Organiser' }));
    expect(screen.getByRole('tab', { name: 'Organiser' })).toHaveAttribute('aria-selected', 'true');
    // The dead Resolve Conflicts button was removed from the real sidebar and
    // from this replica of it.
    expect(screen.queryByText('Resolve Conflicts')).not.toBeInTheDocument();
    // The sidebar replica mirrors the unified navigation: one Dashboard entry
    // per role, with the board (Allocation) and Analytics as separate tools.
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getByText('Allocation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Lecturer' }));
    expect(screen.getByRole('tab', { name: 'Lecturer' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Review and sign off submitted timesheets.')).toBeInTheDocument();
    expect(screen.getByText('James Okafor')).toBeInTheDocument();
  });

  test('supports arrow-key tab navigation and wraps around', () => {
    renderWithRouter(<DashboardPreview />);

    const tabList = screen.getByRole('tablist');
    fireEvent.keyDown(tabList, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Lecturer' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabList, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Tutor' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('TimesheetsContent', () => {
  test('renders tutor loading, empty, and populated states with callbacks', () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    const { container, rerender } = render(
      <TimesheetsContent isTutor isLoading loaded={false} onCreate={onCreate} onOpen={onOpen} />,
    );

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);

    rerender(<TimesheetsContent isTutor onCreate={onCreate} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Timesheet' }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByText(/No timesheets yet/)).toBeInTheDocument();

    rerender(
      <TimesheetsContent
        isTutor
        onOpen={onOpen}
        timesheets={[
          { id: 1, name: 'Week 1', status: 'DRAFT', createdAt: '2026-01-01', updatedAt: '2026-01-02', entries: [{ duration: 1.5 }, { duration: 2 }] },
          { id: 2, name: 'Week 2', status: 'SUBMITTED', createdAt: '2026-01-03', updatedAt: '2026-01-04', entries: [] },
        ]}
      />,
    );

    expect(screen.getByText('3.5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue Editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onOpen).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 1 }), true);
    expect(onOpen).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 2 }), false);
  });

  test('uses lecturer columns and empty state for reviewers', () => {
    const { rerender } = render(<TimesheetsContent isLecturer />);
    expect(screen.getByText('No timesheets are awaiting your review.')).toBeInTheDocument();

    rerender(
      <TimesheetsContent
        isLecturer
        timesheets={[
          { id: 3, name: 'Week 3', status: 'APPROVED', tutorName: 'Alex Mercer', tutorEmail: 'alex@wits.ac.za', entries: [{ duration: 4 }] },
          { id: 4, name: 'Week 4', status: 'REJECTED', tutorName: 'Sam Lee', tutorEmail: 'sam@wits.ac.za', entries: [] },
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Tutor' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Created' })).not.toBeInTheDocument();
    expect(screen.getByText('alex@wits.ac.za')).toBeInTheDocument();
    expect(screen.getByText('REJECTED')).toBeInTheDocument();
  });
});

describe('TutorDashboardContent', () => {
  test('renders loading and empty-course states', () => {
    const { container, rerender } = renderWithRouter(<TutorDashboardContent firstName="Alex" isLoading />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);

    rerender(
      <MemoryRouter>
        <TutorDashboardContent firstName="Alex" courses={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No course assignments yet')).toBeInTheDocument();
  });

  test('renders session states, cover information, and excuse controls', () => {
    const onExcuse = vi.fn();
    const onCancelExcuse = vi.fn();
    const onSubmitExcuse = vi.fn((event) => event.preventDefault());
    const sessions = [
      session(),
      session({ id: 'session-2', status: 'UNASSIGNED', date: futureDate(3), excuseReason: 'Medical appointment' }),
      session({ id: 'session-3', status: 'PENDING', date: futureDate(4) }),
    ];

    const { rerender } = renderWithRouter(
      <TutorDashboardContent
        firstName="Alex"
        courses={[{ assignmentId: 1, courseCode: 'COMS3005', courseName: 'Software Design', allocatedHours: 6, lecturerName: 'Dr Green' }]}
        sessions={sessions}
        maxHoursPerWeek={4}
        weekScheduledHours={5}
        onExcuse={onExcuse}
        onCancelExcuse={onCancelExcuse}
        onSubmitExcuse={onSubmitExcuse}
        formatTime={() => '08:00 – 09:00'}
      />,
    );

    expect(screen.getByText('You lead')).toBeInTheDocument();
    expect(screen.getByText('Excused — awaiting volunteer')).toBeInTheDocument();
    expect(screen.getByText('Volunteer pending')).toBeInTheDocument();
    expect(screen.getByText(/Medical appointment/)).toBeInTheDocument();
    expect(screen.getByText('You excused 1 session that still needs a volunteer.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');
    fireEvent.click(screen.getByRole('button', { name: 'Excuse myself' }));
    expect(onExcuse).toHaveBeenCalledWith('session-1');

    rerender(
      <MemoryRouter>
        <TutorDashboardContent
          firstName="Alex"
          courses={[{ assignmentId: 1, courseCode: 'COMS3005', courseName: 'Software Design', allocatedHours: 6 }]}
          sessions={sessions}
          excusingSessionId="session-1"
          excuseReason="Family emergency"
          onExcuse={onExcuse}
          onCancelExcuse={onCancelExcuse}
          onSubmitExcuse={onSubmitExcuse}
          formatTime={() => '08:00 – 09:00'}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm excuse' }).closest('form'));
    expect(onCancelExcuse).toHaveBeenCalledOnce();
    expect(onSubmitExcuse).toHaveBeenCalledWith(expect.anything(), 'session-1');
  });

  test('shows the no-session and no-next-session guidance', () => {
    renderWithRouter(
      <TutorDashboardContent
        courses={[{ assignmentId: 1, courseCode: 'COMS3005', courseName: 'Software Design', allocatedHours: 6 }]}
        sessions={[session({ date: '2020-01-01', status: 'SCHEDULED' })]}
        maxHoursPerWeek={null}
      />,
    );

    expect(screen.getByText(/No sessions scheduled yet for COMS3005/)).toBeInTheDocument();
    expect(screen.getByText(/No sessions for you to lead right now/)).toBeInTheDocument();
    // No cap on file — the card drops the bar instead of an empty "—h" one.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('No weekly hour limit is on file for you yet.')).toBeInTheDocument();
  });
});
