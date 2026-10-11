import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import Input from '../../components/input/Input';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

const YEARS_OF_STUDY = ['3rd year', 'honours', 'masters', 'phd'];

export default function EditProfile() {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, error, setError } = useAsync();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Auth guard
  useEffect(() => {
    if (!loading && !currentUser) navigate('/login');
  }, [currentUser, loading, navigate]);

  // Load current user data from the backend
  useEffect(() => {
    if (loading || !currentUser) return;

    const loadUser = async () => {
      const res = await execute(() => api.get(`/users/${currentUser.uid}`));
      if (res?.status === 200 && res.data) {
        setFirstName(res.data.firstName || '');
        setLastName(res.data.lastName || '');
        setPhoneNumber(res.data.phoneNumber || '');
        setYearOfStudy(res.data.yearOfStudy || '');
        setEmail(res.data.email || '');
        setLoadError('');
      } else if (res) {
        // A failed load must not leave the form silently blank
        setLoadError(res?.data?.message || 'Could not load your profile. Please try again.');
      }
    };

    loadUser();
  }, [currentUser, loading, execute, reloadKey]);

  if (loading) return null;
  if (!currentUser) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await execute(() =>
      api.put('/users', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        yearOfStudy: yearOfStudy || null,
      })
    );
    setSubmitting(false);
    if (res?.status === 200) {
      navigate('/profile');
    } else if (res) {
      setError(res?.data?.message || 'Could not save your profile. Please try again.');
    }
  };

  const disableSave = !firstName.trim() || !lastName.trim() || submitting;

  return (
    <AppLayout role={currentUser.role?.toLowerCase() || 'tutor'} title="Edit Profile">
      <div className="p-gutter md:p-margin-page max-w-2xl">
        {/* Header */}
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Edit Personal Info</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Update your personal details below
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate('/profile')}>
              Cancel
            </Button>
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {loadError && (
          <div className="flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{loadError}</ErrorMessage>
            <Button
              className="min-w-32"
              onClick={() => {
                setLoadError('');
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-gutter">
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento space-y-stack-md">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-md">
              <Input
                labelText="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alan"
              />
              <Input
                labelText="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Turing"
              />
            </div>

            <Input
              labelText="Email"
              value={email}
              onChange={() => {}}
              icon="mail"
              type="email"
              placeholder="a.turing@university.edu"
            />

            <Input
              labelText="Phone Number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              icon="phone"
              placeholder="+1 (555) 019-2837"
            />

            {/* Year of Study select — styled to match the Input component */}
            <div className="space-y-1">
              <label
                htmlFor="year-of-study"
                className="font-label-caps text-label-caps text-on-surface-variant block"
              >
                Year of Study
              </label>
              <select
                id="year-of-study"
                value={yearOfStudy}
                onChange={(e) => setYearOfStudy(e.target.value)}
                className="w-full rounded-DEFAULT border-outline-variant bg-surface py-2 px-4 font-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
              >
                <option value="">Select year of study</option>
                {YEARS_OF_STUDY.map((year) => (
                  <option key={year} value={year}>
                    {year.charAt(0).toUpperCase() + year.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Department is read-only */}
            <div className="space-y-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant block">
                Department
              </label>
              <p className="font-body-md text-body-md text-on-surface-variant py-2">
                School of Computer Science
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={disableSave} loading={submitting} className="min-w-40">
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
