import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared mutable auth state so each test can pick the signed-in role.
const authState = vi.hoisted(() => ({ currentUser: { role: 'organiser' }, loading: false }));
const navigateMock = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
// The settings payload each test can adjust before rendering.
const settingsData = vi.hoisted(() => ({
  tutorMonthlyClaimableHours: 40,
  tutorEventClaimMonths: 3,
  hourlyRates: {},
  pdfTemplateFilename: null,
}));
// One stable execute across renders that mirrors the real useAsync: run the
// operation and return its result, so the apiMock routes each call by URL.
const useAsyncState = vi.hoisted(() => ({
  execute: vi.fn(async (operation) => operation()),
  isLoading: false,
}));

vi.mock('../../components/layout/AppLayout', () => ({
  // Layout chrome is irrelevant here — pass the page content straight through.
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../../utils/axiosInstance', () => ({ default: apiMock }));
vi.mock('../../hooks/useAsync', () => ({
  default: () => useAsyncState,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

import Configurations from './Configurations.jsx';

const renderConfigurations = () => render(<Configurations />);

const primeGet = () => {
  apiMock.get.mockImplementation((url) => {
    if (url === '/settings') {
      return Promise.resolve({
        status: 200,
        data: { ...settingsData, hourlyRates: { ...settingsData.hourlyRates } },
      });
    }
    // Template download — never clicked in these tests.
    return Promise.resolve({ status: 200, data: new Blob(['pdf']) });
  });
};

describe('Configurations — organiser-only system settings page', () => {
  beforeEach(() => {
    authState.currentUser = { role: 'organiser' };
    authState.loading = false;
    navigateMock.mockClear();
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.delete.mockReset();
    apiMock.put.mockResolvedValue({ status: 200, data: {} });
    apiMock.delete.mockResolvedValue({ status: 200, data: {} });
    settingsData.tutorMonthlyClaimableHours = 40;
    settingsData.tutorEventClaimMonths = 3;
    settingsData.hourlyRates = {};
    settingsData.pdfTemplateFilename = null;
    primeGet();
  });

  test('organisers see the four configuration cards with their saved values', async () => {
    settingsData.hourlyRates = { '3rd year': 120 };
    settingsData.pdfTemplateFilename = 'claim-form.pdf';
    renderConfigurations();

    // Flush the async settings load so its state updates land inside act().
    await act(async () => {});

    expect(screen.getByRole('heading', { name: /max claimable hours/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /event claim window/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /hourly rates by year of study/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /timesheet pdf template/i })).toBeInTheDocument();

    expect(screen.getByDisplayValue('40')).toBeInTheDocument(); // monthly hours
    expect(screen.getByDisplayValue('3')).toBeInTheDocument(); // claim months
    expect(screen.getByDisplayValue('120')).toBeInTheDocument(); // 3rd-year rate
    expect(screen.getByText('claim-form.pdf')).toBeInTheDocument();
    expect(screen.getByText('Replace Template')).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/settings');
  });

  test('non-organisers are sent back to their profile', async () => {
    authState.currentUser = { role: 'tutor' };
    renderConfigurations();
    await act(async () => {});

    expect(navigateMock).toHaveBeenCalledWith('/profile');
    expect(
      screen.queryByRole('heading', { name: /max claimable hours/i }),
    ).not.toBeInTheDocument();
  });

  test('saving the monthly hours PUTs the new whole number', async () => {
    apiMock.put.mockResolvedValueOnce({
      status: 200,
      data: { tutorMonthlyClaimableHours: 50 },
    });
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('40'), { target: { value: '50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0]);
    await act(async () => {});

    expect(apiMock.put).toHaveBeenCalledWith('/settings/tutor-monthly-hours', {
      tutorMonthlyClaimableHours: 50,
    });
    const notes = await screen.findAllByText(/setting saved successfully/i);
    expect(notes.length).toBeGreaterThan(0);
  });

  test('saving hourly rates PUTs parsed numbers and clears empty fields', async () => {
    settingsData.hourlyRates = { '3rd year': 120, honours: 150 };
    apiMock.put.mockResolvedValueOnce({
      status: 200,
      data: { hourlyRates: { '3rd year': 150, honours: 150 } },
    });
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rates' }));
    await act(async () => {});

    expect(apiMock.put).toHaveBeenCalledWith('/settings/hourly-rates', {
      hourlyRates: { '3rd year': 150, honours: 150, masters: null, phd: null },
    });
    expect(await screen.findByText(/hourly rates saved successfully/i)).toBeInTheDocument();
  });

  test('removing the PDF template clears the stored file', async () => {
    settingsData.pdfTemplateFilename = 'claim-form.pdf';
    renderConfigurations();
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(async () => {});

    expect(apiMock.delete).toHaveBeenCalledWith('/settings/pdf-template');
    expect(await screen.findByText('No template uploaded yet.')).toBeInTheDocument();
  });

  test('uploading a PDF PUTs it as multipart form data', async () => {
    apiMock.put.mockResolvedValueOnce({
      status: 200,
      data: { pdfTemplateFilename: 'new-template.pdf' },
    });
    const { container } = renderConfigurations();
    await act(async () => {});

    const file = new File(['template'], 'new-template.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });
    await act(async () => {});

    expect(apiMock.put).toHaveBeenCalledTimes(1);
    const [url, body, config] = apiMock.put.mock.calls[0];
    expect(url).toBe('/settings/pdf-template');
    expect(body).toBeInstanceOf(FormData);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    expect(await screen.findByText('new-template.pdf')).toBeInTheDocument();
  });

  test('admins can open the page like organisers', async () => {
    authState.currentUser = { role: 'admin' };
    renderConfigurations();
    await act(async () => {});

    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /max claimable hours/i })).toBeInTheDocument();
  });

  test('signed-out visitors are redirected to the login page', async () => {
    authState.currentUser = null;
    renderConfigurations();
    await act(async () => {});

    expect(navigateMock).toHaveBeenCalledWith('/login');
    expect(
      screen.queryByRole('heading', { name: /max claimable hours/i }),
    ).not.toBeInTheDocument();
  });

  test('saving the event claim window PUTs the new month count', async () => {
    apiMock.put.mockResolvedValueOnce({
      status: 200,
      data: { tutorEventClaimMonths: 6 },
    });
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '6' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[1]);
    await act(async () => {});

    expect(apiMock.put).toHaveBeenCalledWith('/settings/tutor-event-claim-months', {
      tutorEventClaimMonths: 6,
    });
    const notes = await screen.findAllByText(/setting saved successfully/i);
    expect(notes.length).toBeGreaterThan(0);
  });

  test('surfaces the server message when saving the claim window fails', async () => {
    apiMock.put.mockImplementation((url) =>
      url === '/settings/tutor-event-claim-months'
        ? Promise.resolve({ status: 400, data: { message: 'Window too wide.' } })
        : Promise.resolve({ status: 200, data: {} }),
    );
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '6' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[1]);
    await act(async () => {});

    expect(await screen.findByText('Window too wide.')).toBeInTheDocument();
  });

  test('shows the fallback error when saving the monthly hours is rejected', async () => {
    apiMock.put.mockResolvedValue({ status: 400, data: {} });
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('40'), { target: { value: '50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0]);
    await act(async () => {});

    expect(
      await screen.findByText('Could not save the setting. Please try again.'),
    ).toBeInTheDocument();
  });

  test('surfaces the fallback error when saving the rates fails', async () => {
    settingsData.hourlyRates = { '3rd year': 120 };
    apiMock.put.mockResolvedValue({ status: 500, data: {} });
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '130' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rates' }));
    await act(async () => {});

    expect(
      await screen.findByText('Could not save hourly rates. Please try again.'),
    ).toBeInTheDocument();
  });

  test('shows an error when the settings fail to load', async () => {
    apiMock.get.mockResolvedValue({ status: 500, data: {} });
    renderConfigurations();
    await act(async () => {});

    expect(
      await screen.findByText('Could not load the settings. Please refresh the page.'),
    ).toBeInTheDocument();
  });

  test('downloads the template through the authenticated client', async () => {
    settingsData.pdfTemplateFilename = 'claim-form.pdf';
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderConfigurations();
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await act(async () => {});

    expect(apiMock.get).toHaveBeenCalledWith('/settings/pdf-template', { responseType: 'blob' });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    clickSpy.mockRestore();
  });

  test('shows an error when the template download fails', async () => {
    settingsData.pdfTemplateFilename = 'claim-form.pdf';
    apiMock.get.mockImplementation((url) =>
      url === '/settings'
        ? Promise.resolve({
            status: 200,
            data: { ...settingsData, hourlyRates: { ...settingsData.hourlyRates } },
          })
        : Promise.resolve({ status: 500, data: {} }),
    );
    renderConfigurations();
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await act(async () => {});

    expect(
      await screen.findByText('Could not download the template. Please try again.'),
    ).toBeInTheDocument();
  });

  test('ignores a file input change without a file and surfaces upload failures', async () => {
    settingsData.pdfTemplateFilename = 'claim-form.pdf';
    apiMock.put.mockResolvedValue({ status: 500, data: {} });
    apiMock.delete.mockResolvedValue({ status: 500, data: {} });
    const { container } = renderConfigurations();
    await act(async () => {});

    // No file selected — nothing is sent.
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [] } });
    expect(apiMock.put).not.toHaveBeenCalled();

    // A failed upload keeps the old template and shows the fallback error.
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['template'], 't.pdf', { type: 'application/pdf' })] },
    });
    await act(async () => {});
    expect(
      await screen.findByText('Could not upload the PDF template. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('claim-form.pdf')).toBeInTheDocument();

    // A failed removal keeps the template too.
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(async () => {});
    expect(
      await screen.findByText('Could not remove the PDF template.'),
    ).toBeInTheDocument();
    expect(screen.getByText('claim-form.pdf')).toBeInTheDocument();
  });

  test('out-of-range values keep the save buttons disabled', async () => {
    renderConfigurations();
    await act(async () => {});

    const saveButtons = screen.getAllByRole('button', { name: 'Save Changes' });
    expect(saveButtons[0]).toBeDisabled(); // unchanged value
    const hoursInput = screen.getByPlaceholderText('e.g. 60');
    fireEvent.change(hoursInput, { target: { value: '800' } }); // above 744
    expect(saveButtons[0]).toBeDisabled();
    fireEvent.change(hoursInput, { target: { value: '12.5' } }); // not whole
    expect(saveButtons[0]).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. 3'), { target: { value: '25' } }); // above 24
    expect(saveButtons[1]).toBeDisabled();
  });

  test('rate fields start clean with server nulls and reject invalid amounts', async () => {
    settingsData.hourlyRates = { '3rd year': null, honours: null, masters: null, phd: null };
    renderConfigurations();
    await act(async () => {});

    const saveRates = screen.getByRole('button', { name: 'Save Rates' });
    expect(saveRates).toBeDisabled(); // nothing changed yet

    const firstRate = screen.getAllByPlaceholderText('e.g. 150')[0];
    fireEvent.change(firstRate, { target: { value: '-5' } });
    expect(saveRates).toBeDisabled(); // negative rates are invalid

    fireEvent.change(firstRate, { target: { value: '150' } });
    expect(saveRates).not.toBeDisabled();
  });

  test('renders nothing while the auth state is still loading', () => {
    authState.loading = true;
    const { container } = renderConfigurations();

    expect(container).toBeEmptyDOMElement();
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  test('leaves the fields blank when the server returns null settings', async () => {
    settingsData.tutorMonthlyClaimableHours = null;
    settingsData.tutorEventClaimMonths = null;
    settingsData.hourlyRates = null;
    renderConfigurations();
    await act(async () => {});

    expect(screen.queryByDisplayValue(/./)).not.toBeInTheDocument();
    const saveButtons = screen.getAllByRole('button', { name: 'Save Changes' });
    expect(saveButtons[0]).toBeDisabled();
    expect(saveButtons[1]).toBeDisabled();
  });

  test('shows the fallback error when the claim window save fails without a message', async () => {
    apiMock.put.mockImplementation((url) =>
      url === '/settings/tutor-event-claim-months'
        ? Promise.resolve({ status: 400, data: {} })
        : Promise.resolve({ status: 200, data: {} }),
    );
    renderConfigurations();
    await act(async () => {});

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '6' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[1]);
    await act(async () => {});

    expect(
      await screen.findByText('Could not save the setting. Please try again.'),
    ).toBeInTheDocument();
  });
});
