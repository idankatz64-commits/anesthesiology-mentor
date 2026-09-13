import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from '@/pages/ResetPassword';
import EmailOtpNotice from '@/components/EmailOtpNotice';
afterEach(cleanup);
it('keeps old password-reset links useful without collecting a new password', () => {
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'כניסה עם קוד במייל' })).toHaveAttribute('href', '/auth');
  expect(screen.queryByLabelText('סיסמה חדשה')).not.toBeInTheDocument();
});
it('explains the transition to already signed-in users without requiring logout', () => {
  render(<EmailOtpNotice />);
  expect(screen.getByLabelText('עדכון שיטת ההתחברות')).toHaveTextContent('בלי להתנתק עכשיו');
});
