import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGet, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: mockGet, put: mockPut, delete: mockDelete },
}));

import TimetableUploadCard from './TimetableUploadCard.jsx';

const UPLOADED_PDF = {
  originalName: 'term-timetable.pdf',
  sizeBytes: 204800,
  uploadedAt: '2026-10-01T10:00:00.000Z',
  extractedSlots: [
    { dayOfWeek: 0, timeSlotId: 1 },
    { dayOfWeek: 1, timeSlotId: 1 },
    { dayOfWeek: 2, timeSlotId: 1 },
  ],
};

const renderCard = (props = {}) =>
  render(
    // The card links to the editor when no onApply is given, so it needs a router.
    <MemoryRouter>
      <TimetableUploadCard {...props} />
    </MemoryRouter>,
  );

const chooseFile = (file) => {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
};

describe('TimetableUploadCard — reusable PDF timetable upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders the empty state when nothing has been uploaded (404)', async () => {
    mockGet.mockResolvedValue({ status: 404, data: {} });

    renderCard();

    expect(await screen.findByText('No timetable uploaded yet.')).toBeInTheDocument();
    expect(screen.getByText('Upload Timetable')).toBeInTheDocument();
    expect(screen.queryByText(/Detected/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  test('shows the uploaded PDF with its size, extraction summary and actions', async () => {
    mockGet.mockResolvedValue({ status: 200, data: { timetablePdf: UPLOADED_PDF } });

    renderCard({ onApply: vi.fn() });

    expect(await screen.findByText('term-timetable.pdf')).toBeInTheDocument();
    expect(screen.getByText(/200 KB/)).toBeInTheDocument();
    expect(screen.getByText('Detected 3 free slots in this PDF.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByText('Replace Timetable')).toBeInTheDocument();
  });

  test('links to the editor instead of an apply action when no onApply is passed', async () => {
    mockGet.mockResolvedValue({ status: 200, data: { timetablePdf: UPLOADED_PDF } });

    renderCard();

    expect(await screen.findByText('term-timetable.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to My Timetable' })).not.toBeInTheDocument();
    expect(screen.getByText(/to add them to your availability/)).toBeInTheDocument();
  });

  test('hands the extracted slots to the host page via onApply', async () => {
    const onApply = vi.fn();
    mockGet.mockResolvedValue({ status: 200, data: { timetablePdf: UPLOADED_PDF } });

    renderCard({ onApply });

    fireEvent.click(await screen.findByRole('button', { name: 'Add to My Timetable' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(UPLOADED_PDF.extractedSlots);
  });

  test('rejects non-PDF files before any request is made', async () => {
    mockGet.mockResolvedValue({ status: 404, data: {} });

    renderCard();
    await screen.findByText('No timetable uploaded yet.');

    chooseFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByText('Only PDF files can be uploaded.')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('rejects PDFs larger than 500KB before any request is made', async () => {
    mockGet.mockResolvedValue({ status: 404, data: {} });

    renderCard();
    await screen.findByText('No timetable uploaded yet.');

    const oversized = new File(['x'.repeat(500 * 1024 + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    chooseFile(oversized);

    expect(
      await screen.findByText('The timetable PDF must be 500KB or smaller.'),
    ).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('uploads a valid PDF and shows the returned extraction summary', async () => {
    mockGet.mockResolvedValue({ status: 404, data: {} });
    mockPut.mockResolvedValue({
      status: 200,
      data: {
        message: 'Detected 12 available slot(s) in your timetable.',
        timetablePdf: {
          originalName: 'good.pdf',
          sizeBytes: 1024,
          uploadedAt: '2026-10-01T10:00:00.000Z',
          extractedSlots: Array.from({ length: 12 }, (_, index) => ({
            dayOfWeek: index % 5,
            timeSlotId: 1,
          })),
        },
      },
    });

    renderCard();
    await screen.findByText('No timetable uploaded yet.');

    chooseFile(new File(['pdf'], 'good.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('good.pdf')).toBeInTheDocument();
    expect(screen.getByText('Detected 12 free slots in this PDF.')).toBeInTheDocument();
    expect(mockPut).toHaveBeenCalledWith('/availability/timetable-pdf', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  });

  test('removes the timetable and returns to the empty state', async () => {
    mockGet.mockResolvedValue({ status: 200, data: { timetablePdf: UPLOADED_PDF } });
    mockDelete.mockResolvedValue({ status: 200, data: { message: 'Timetable PDF removed.' } });

    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('No timetable uploaded yet.')).toBeInTheDocument();
    expect(mockDelete).toHaveBeenCalledWith('/availability/timetable-pdf');
  });
});
