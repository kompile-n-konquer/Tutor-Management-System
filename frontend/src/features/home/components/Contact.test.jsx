import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Contact from './Contact.jsx';
import Navbar from './Navbar.jsx';

describe('Contact', () => {
  test('submits a message and lets the visitor start another one', () => {
    render(<Contact />);

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alan Turing' } });
    fireEvent.change(screen.getByLabelText('University Email'), { target: { value: 'alan@university.edu' } });
    fireEvent.change(screen.getByLabelText('User Category'), { target: { value: 'convenor' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Question' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please help.' } });
    fireEvent.submit(screen.getByRole('button', { name: /Send Message/ }).closest('form'));

    expect(screen.getByRole('status')).toHaveTextContent(/routed to CSAM Support/i);
    fireEvent.click(screen.getByRole('button', { name: 'Send another message' }));
    expect(screen.getByRole('button', { name: /Send Message/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toHaveValue('');
  });

  test('shows helpdesk contact options', () => {
    render(<Contact />);

    expect(screen.getByRole('link', { name: 'csam.help@university.edu' })).toHaveAttribute(
      'href',
      'mailto:csam.help@university.edu',
    );
    expect(screen.getByText('Mathematical Sciences Building, 3rd Floor')).toBeInTheDocument();
    expect(screen.getByText('Mon – Fri: 08:00 – 16:30')).toBeInTheDocument();
  });
});

describe('Navbar', () => {
  test('opens and closes the mobile navigation drawer', () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Benefits' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('link', { name: 'Benefits' })[1]);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  test('keeps authentication links pointed at the real routes', () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Log In' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /Enter Portal/ })).toHaveAttribute('href', '/signup');
  });
});
