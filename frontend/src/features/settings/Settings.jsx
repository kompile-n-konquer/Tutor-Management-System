import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import Button from "../../components/button/Button";
import Input from "../../components/input/Input";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import api from "../../utils/axiosInstance";
import useAsync from "../../hooks/useAsync";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import AppearanceSettings from "./AppearanceSettings";

// A month has at most 744 hours (31 days) — the backend enforces the same bound
const MAX_MONTHLY_HOURS = 744;
// The event claim window can span at most two years of past events
const MAX_CLAIM_MONTHS = 24;

const YEARS_OF_STUDY = ['3rd year', 'honours', 'masters', 'phd'];
const RATE_LABELS = {
  '3rd year': '3rd Year',
  honours: 'Honours',
  masters: 'Masters',
  phd: 'PhD',
};

const Settings = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [monthlyHours, setMonthlyHours] = useState(""); // string so the Input stays controllable
  const [savedMonthlyHours, setSavedMonthlyHours] = useState(null);
  const [claimMonths, setClaimMonths] = useState("");
  const [savedClaimMonths, setSavedClaimMonths] = useState(null);
  const [hourlyRates, setHourlyRates] = useState({ '3rd year': '', honours: '', masters: '', phd: '' });
  const [savedRates, setSavedRates] = useState({ '3rd year': null, honours: null, masters: null, phd: null });
  const [ratesSaved, setRatesSaved] = useState(false);
  const [pdfTemplateName, setPdfTemplateName] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const role = currentUser?.role?.toLowerCase();
  const isOrganiser = role === "organiser" || role === "admin";

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate("/login");
    }
  }, [currentUser, loading, navigate]);

  useEffect(() => {
    if (loading || !currentUser || !isOrganiser) return;

    const loadSettings = async () => {
      const response = await execute(() => api.get("/settings"));
      if (response && response.status === 200) {
        setError("");
        setLoadFailed(false);
        const hours = response.data.tutorMonthlyClaimableHours;
        setMonthlyHours(hours === null ? "" : String(hours));
        setSavedMonthlyHours(hours);
        const months = response.data.tutorEventClaimMonths;
        setClaimMonths(months === null ? "" : String(months));
        setSavedClaimMonths(months);
        const rates = response.data.hourlyRates || {};
        const nextRates = {};
        for (const year of YEARS_OF_STUDY) {
          nextRates[year] = rates[year] != null ? String(rates[year]) : '';
        }
        setHourlyRates(nextRates);
        setSavedRates(rates);
        setPdfTemplateName(response.data.pdfTemplateFilename || null);
      } else {
        setError("Could not load the settings. Please try again.");
        setLoadFailed(true);
      }
    };

    loadSettings();
  }, [currentUser, loading, isOrganiser, execute, reloadKey]);

  if (loading) return null;
  if (!currentUser) return null;

  const parsedHours = Number(monthlyHours);
  const hoursEntered = monthlyHours !== "";
  const hoursValid =
    hoursEntered &&
    !Number.isNaN(parsedHours) &&
    Number.isInteger(parsedHours) &&
    parsedHours >= 1 &&
    parsedHours <= MAX_MONTHLY_HOURS;
  const hasChanges = hoursEntered && parsedHours !== savedMonthlyHours;

  const parsedMonths = Number(claimMonths);
  const monthsEntered = claimMonths !== "";
  const monthsValid =
    monthsEntered &&
    !Number.isNaN(parsedMonths) &&
    Number.isInteger(parsedMonths) &&
    parsedMonths >= 1 &&
    parsedMonths <= MAX_CLAIM_MONTHS;
  const monthsChanged = monthsEntered && parsedMonths !== savedClaimMonths;
  const monthsHasChanges = (monthsEntered && savedClaimMonths === null) || monthsChanged;

  // Hourly rates validation and dirty check
  const ratesValid = YEARS_OF_STUDY.every((year) => {
    const v = hourlyRates[year];
    if (v === '' || v === null || v === undefined) return true; // empty = clear, valid
    const n = Number(v);
    return !Number.isNaN(n) && n >= 0 && n <= 5000;
  });
  const ratesDirty = YEARS_OF_STUDY.some((year) => {
    const current = hourlyRates[year] === '' ? null : Number(hourlyRates[year]);
    return current !== savedRates[year];
  });

  const handleSaveRates = async () => {
    setRatesSaved(false);
    setError('');
    const payload = {};
    for (const year of YEARS_OF_STUDY) {
      payload[year] = hourlyRates[year] === '' ? null : Number(hourlyRates[year]);
    }
    const response = await execute(() =>
      api.put('/settings/hourly-rates', { hourlyRates: payload })
    );
    if (response && response.status === 200) {
      setSavedRates(response.data.hourlyRates);
      setRatesSaved(true);
    } else {
      setError(response?.data?.message || 'Could not save hourly rates. Please try again.');
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    setError('');
    const formData = new FormData();
    formData.append('template', file);
    const response = await execute(() =>
      api.put('/settings/pdf-template', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    );
    setUploadingPdf(false);
    if (response && response.status === 200) {
      setPdfTemplateName(response.data.pdfTemplateFilename);
    } else {
      setError(response?.data?.message || 'Could not upload the PDF template. Please try again.');
    }
  };

  const handleRemovePdf = async () => {
    setError("");
    const response = await execute(() => api.delete('/settings/pdf-template'));
    if (response && response.status === 200) {
      setPdfTemplateName(null);
    } else {
      setError(response?.data?.message || 'Could not remove the PDF template.');
    }
  };

  // The endpoint requires the Firebase ID token, so the file is fetched through
  // the authenticated axios instance and handed to the browser as a blob
  const handleDownloadPdf = async () => {
    setError('');
    const response = await execute(() =>
      api.get('/settings/pdf-template', { responseType: 'blob' })
    );
    if (response && response.status === 200) {
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfTemplateName || 'timesheet-template.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      setError('Could not download the template. Please try again.');
    }
  };

  const handleSave = async () => {
    setSaved(false);
    setError("");

    const response = await execute(() =>
      api.put("/settings/tutor-monthly-hours", { tutorMonthlyClaimableHours: parsedHours })
    );

    if (response && response.status === 200) {
      setSavedMonthlyHours(response.data.tutorMonthlyClaimableHours);
      setSaved(true);
    } else {
      setError(response?.data?.message || "Could not save the setting. Please try again.");
    }
  };

  const handleSaveMonths = async () => {
    setSaved(false);
    setError("");

    const response = await execute(() =>
      api.put("/settings/tutor-event-claim-months", { tutorEventClaimMonths: parsedMonths })
    );

    if (response && response.status === 200) {
      setSavedClaimMonths(response.data.tutorEventClaimMonths);
      setSaved(true);
    } else {
      setError(response?.data?.message || "Could not save the setting. Please try again.");
    }
  };

  return (
    <AppLayout role="organiser" title="Settings" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Settings</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Manage system-wide preferences.
          </p>
        </div>

        {error && (
          <div className="flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            {loadFailed && (
              <Button
                className="min-w-32"
                onClick={() => {
                  setError("");
                  setLoadFailed(false);
                  setReloadKey((key) => key + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        )}

        <div className="space-y-gutter">
          {/* Appearance applies to every signed-in user, not just organisers. */}
          <AppearanceSettings />

          {isOrganiser ? (
            <div className="space-y-gutter">
            <div className="flex flex-wrap items-stretch gap-gutter">
              <div className="flex-1 min-w-[340px] bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
                <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    Max Claimable Hours
                  </h3>
                  <p className="font-body-sm text-outline mt-1">
                    The maximum number of hours a tutor can claim in a month. Tutors may claim more in total as long as 
                    a month stays within this maximum.
                  </p>
                </div>

                <Input
                  labelText="Hours per 31 days"
                  type="number"
                  icon="schedule"
                  placeholder="e.g. 60"
                  value={monthlyHours}
                  onChange={(event) => {
                    setSaved(false);
                    setMonthlyHours(event.target.value);
                  }}
                />

                {saved && (
                  <p className="mt-gutter font-body-sm text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Setting saved successfully.
                  </p>
                )}

                <div className="mt-gutter flex items-center gap-4">
                  <Button
                    onClick={handleSave}
                    disabled={!hoursValid || !hasChanges}
                    loading={isLoading}
                    className="min-w-40"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-w-[340px] bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
                <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    Event Claim Window
                  </h3>
                  <p className="font-body-sm text-outline mt-1">
                    How many months back a tutor can claim an event on a timesheet. Events older than
                    this window can no longer be claimed.
                  </p>
                </div>

                <Input
                  labelText="Months"
                  type="number"
                  icon="calendar_month"
                  placeholder="e.g. 3"
                  value={claimMonths}
                  onChange={(event) => {
                    setSaved(false);
                    setClaimMonths(event.target.value);
                  }}
                />

                {saved && (
                  <p className="mt-gutter font-body-sm text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Setting saved successfully.
                  </p>
                )}

                <div className="mt-gutter flex items-center gap-4">
                  <Button
                    onClick={handleSaveMonths}
                    disabled={!monthsValid || !monthsHasChanges}
                    loading={isLoading}
                    className="min-w-40"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>

            {/* Hourly Rates Card — full width */}
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
              <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Hourly Rates by Year of Study
                </h3>
                <p className="font-body-sm text-outline mt-1">
                  Set the amount (in ZAR) a tutor can claim per hour based on their year of study.
                  Leave a field empty to clear a rate.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
                {YEARS_OF_STUDY.map((year) => (
                  <Input
                    key={year}
                    labelText={`${RATE_LABELS[year]} (R/hr)`}
                    type="number"
                    icon="payments"
                    placeholder="e.g. 150"
                    value={hourlyRates[year]}
                    onChange={(e) => {
                      setRatesSaved(false);
                      setHourlyRates((prev) => ({ ...prev, [year]: e.target.value }));
                    }}
                  />
                ))}
              </div>

              {ratesSaved && (
                <p className="mt-gutter font-body-sm text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  Hourly rates saved successfully.
                </p>
              )}

              <div className="mt-gutter flex items-center gap-4">
                <Button
                  onClick={handleSaveRates}
                  disabled={!ratesValid || !ratesDirty}
                  loading={isLoading}
                  className="min-w-40"
                >
                  Save Rates
                </Button>
              </div>
            </div>

            {/* PDF Template Card — full width */}
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
              <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Timesheet PDF Template
                </h3>
                <p className="font-body-sm text-outline mt-1">
                  Upload a fillable PDF template that will be populated with timesheet data when
                  exporting. The template should contain form fields for tutor name, entries, hours,
                  and totals.
                </p>
              </div>

              {pdfTemplateName ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-on-surface">
                    <span className="material-symbols-outlined text-primary text-[24px]">description</span>
                    <span className="font-body-md">{pdfTemplateName}</span>
                  </div>
                  <button
                    onClick={handleDownloadPdf}
                    className="text-primary font-label-caps text-label-caps hover:underline cursor-pointer"
                  >
                    Download
                  </button>
                  <button
                    onClick={handleRemovePdf}
                    className="text-error font-label-caps text-label-caps hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="font-body-md text-on-surface-variant">
                  No template uploaded yet.
                </p>
              )}

              <div className="mt-gutter">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-4 py-2 border border-outline rounded-lg font-label-caps text-label-caps text-on-surface hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    {pdfTemplateName ? 'Replace Template' : 'Upload Template'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    disabled={uploadingPdf}
                    className="hidden"
                  />
                </label>
                {uploadingPdf && (
                  <span className="ml-3 font-body-sm text-outline">Uploading...</span>
                )}
              </div>
            </div>
          </div>
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento max-w-xl">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-outline text-[32px]">tune</span>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface">
                    System settings coming soon
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    Organiser-only settings are not yet available. They will appear here
                    later.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
