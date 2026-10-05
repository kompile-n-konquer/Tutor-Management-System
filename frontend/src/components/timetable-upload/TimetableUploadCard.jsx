import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../button/Button';
import ErrorMessage from '../error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';

// The backend enforces the same ceiling via multer
const MAX_SIZE_BYTES = 500 * 1024;

const formatSize = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * TimetableUploadCard
 * Reusable card for uploading a PDF timetable (e.g. the user's class
 * timetable). The file persists on the server, so the upload is visible from
 * any device, and the availability extracted from the PDF is shown with an
 * action to apply it. Pass `onApply(extractedSlots)` to let the host page
 * apply the slots (used by the Edit Timetable grid); without it the card
 * links to the Edit Timetable page instead.
 */
const TimetableUploadCard = ({ onApply }) => {
  const { execute, isLoading, error, setError } = useAsync();
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await api.get('/availability/timetable-pdf');
        if (response?.status === 200) {
          setMetadata(response.data.timetablePdf);
        }
        // 404 (nothing uploaded yet) is the expected empty state — ignore it
      } catch {
        // A failed lookup (e.g. offline) just leaves the empty state in place
      }
    };

    loadMetadata();
  }, []);

  const extractedSlots = metadata?.extractedSlots ?? [];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after a replace
    if (!file) return;

    setError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files can be uploaded.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('The timetable PDF must be 500KB or smaller.');
      return;
    }

    const formData = new FormData();
    formData.append('timetable', file);
    const response = await execute(() =>
      api.put('/availability/timetable-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
    if (response && response.status === 200) {
      setMetadata(response.data.timetablePdf);
    } else {
      setError(response?.data?.message || 'Could not upload the timetable. Please try again.');
    }
  };

  const handleRemove = async () => {
    setError('');
    const response = await execute(() => api.delete('/availability/timetable-pdf'));
    if (response && response.status === 200) {
      setMetadata(null);
    } else {
      setError(response?.data?.message || 'Could not remove the timetable. Please try again.');
    }
  };

  // The endpoint requires the Firebase ID token, so the file is fetched through
  // the authenticated axios instance and handed to the browser as a blob
  const handleDownload = async () => {
    setError('');
    const response = await execute(() =>
      api.get('/availability/timetable-pdf/download', { responseType: 'blob' }),
    );
    if (response && response.status === 200) {
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = metadata?.originalName || 'timetable.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      setError('Could not download the timetable. Please try again.');
    }
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
      <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          Timetable PDF
        </h3>
        <p className="font-body-sm text-outline mt-1">
          Upload your timetable PDF (max 500KB). The free slots detected in it can be added to
          your availability.
        </p>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {metadata ? (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-on-surface min-w-0">
              <span className="material-symbols-outlined text-primary text-[24px]">description</span>
              <span className="font-body-md truncate">{metadata.originalName}</span>
            </div>
            <span className="font-body-sm text-outline">
              {formatSize(metadata.sizeBytes)} · Uploaded{' '}
              {new Date(metadata.uploadedAt).toLocaleDateString('en-ZA', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <button
              onClick={handleDownload}
              disabled={isLoading}
              className="text-primary font-label-caps text-label-caps hover:underline cursor-pointer disabled:opacity-50"
            >
              Download
            </button>
            <button
              onClick={handleRemove}
              disabled={isLoading}
              className="text-error font-label-caps text-label-caps hover:underline cursor-pointer disabled:opacity-50"
            >
              Remove
            </button>
          </div>

          {extractedSlots.length > 0 ? (
            <p className="mt-stack-sm font-body-sm text-primary flex items-start gap-1">
              <span className="material-symbols-outlined text-[16px] mt-0.5">check_circle</span>
              Detected {extractedSlots.length} free slot{extractedSlots.length === 1 ? '' : 's'} in
              this PDF.
            </p>
          ) : (
            <p className="mt-stack-sm font-body-sm text-on-surface-variant flex items-start gap-1">
              <span className="material-symbols-outlined text-[16px] mt-0.5">info</span>
              No free slots could be detected in this PDF yet.
            </p>
          )}

          {extractedSlots.length > 0 && !onApply && (
            <p className="mt-stack-sm font-body-sm text-on-surface-variant">
              Open{' '}
              <Link to="/timetable/edit" className="text-primary hover:underline">
                Edit Timetable
              </Link>{' '}
              to add them to your availability.
            </p>
          )}
        </>
      ) : (
        <p className="font-body-md text-on-surface-variant">No timetable uploaded yet.</p>
      )}

      <div className="mt-gutter flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="inline-flex items-center gap-2 px-4 py-2 border border-outline rounded-lg font-label-caps text-label-caps text-on-surface hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            {metadata ? 'Replace Timetable' : 'Upload Timetable'}
          </span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleUpload}
            disabled={isLoading}
            className="hidden"
          />
        </label>
        {isLoading && <span className="ml-3 font-body-sm text-outline">Uploading...</span>}
      
        {extractedSlots.length > 0 && onApply && (
          <div>
            <Button onClick={() => onApply(extractedSlots)} className="min-w-40">
              Add to My Timetable
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimetableUploadCard;
