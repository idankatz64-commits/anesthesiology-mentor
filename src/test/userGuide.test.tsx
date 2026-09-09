import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import UserGuide, { GuideHelp } from '@/components/UserGuide';
import guide from '@/content/userGuide.he.json';
afterEach(cleanup);
describe('user guide', () => {
  it('opens from a keyboard-accessible button and offers a direct PDF download', () => {
    render(<UserGuide />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'מדריך שימוש' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(guide.title);
    expect(screen.getByRole('link', { name: 'הורדת המדריך כ־PDF' })).toHaveAttribute('href', '/guides/ysnp-user-guide-he.pdf');
    expect(screen.getByRole('link')).toHaveAttribute('download');
    expect(screen.getByText('מתחילים כאן').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('פירוש מדדי ההתקדמות').closest('details')).not.toHaveAttribute('open');
  });
  it('contextual help reuses the exact guide text and does not expand by default', () => {
    const { container } = render(<GuideHelp sectionId="metrics" label="עזרה במדדים" />);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByText(guide.sections.find(s => s.id === 'metrics')!.steps[0])).toBeInTheDocument();
  });
});
