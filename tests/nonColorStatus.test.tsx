import { render, screen } from '@testing-library/react-native';

import type { StepStatus } from '@/domain/patterns/patternProgress';
import { GuideViewerStepRow } from '@/features/guides/presentation/GuideViewerStepRow';
import { PatternViewerStepRow } from '@/features/patterns/presentation/PatternViewerStepRow';

/**
 * Issue #14 AC4 (A11Y-03): completion, selection, and to-do status stay
 * recoverable with colour removed. Every assertion reads a role, an
 * accessibility state, or rendered text — never a className or a colour — so a
 * change that conveyed status only by swapping one accent class for another
 * fails every case.
 */

const CASES: readonly {
  status: StepStatus;
  word: string;
  checked: boolean;
  selected: boolean;
  controlName: string;
}[] = [
  {
    status: 'completed',
    word: 'Completed',
    checked: true,
    selected: false,
    controlName: 'Reopen step 2',
  },
  {
    status: 'current',
    word: 'Current step',
    checked: false,
    selected: true,
    controlName: 'Mark step 2 complete',
  },
  {
    status: 'todo',
    word: 'To do',
    checked: false,
    selected: false,
    controlName: 'Mark step 2 complete',
  },
];

describe('step status without colour (A11Y-03)', () => {
  describe.each(CASES)(
    'pattern viewer row — $status',
    ({ status, word, checked, selected, controlName }) => {
      it('states the status in words, as checkbox state, and as selection', async () => {
        await render(
          <PatternViewerStepRow
            onComplete={jest.fn()}
            onReopen={jest.fn()}
            onSelect={jest.fn()}
            step={{ id: 'p2', index: 1, instruction: 'Turn the work', status }}
            total={3}
          />,
        );

        expect(screen.getByText(word)).toBeOnTheScreen();
        const control = screen.getByRole('checkbox', { name: controlName });
        expect(control.props.accessibilityState.checked).toBe(checked);
        expect(
          screen.getByText('Turn the work').props.accessibilityState.selected,
        ).toBe(selected);
      });
    },
  );

  describe.each(CASES)(
    'guide viewer row — $status',
    ({ status, word, checked, selected, controlName }) => {
      it('states the status in words, as checkbox state, and as selection', async () => {
        await render(
          <GuideViewerStepRow
            note={undefined}
            onComplete={jest.fn()}
            onReopen={jest.fn()}
            step={{ id: 'g2', index: 1, instruction: 'Turn the work', status }}
            total={3}
            transcriptExcerpt={undefined}
            videoOffsetMs={undefined}
          />,
        );

        expect(screen.getByText(word)).toBeOnTheScreen();
        const control = screen.getByRole('checkbox', { name: controlName });
        expect(control.props.accessibilityState.checked).toBe(checked);
        expect(
          screen.getByText('Turn the work').props.accessibilityState.selected,
        ).toBe(selected);
      });
    },
  );

  it('offers "Work on step" only for a to-do pattern step (the third non-colour cue)', async () => {
    const { rerender } = await render(
      <PatternViewerStepRow
        onComplete={jest.fn()}
        onReopen={jest.fn()}
        onSelect={jest.fn()}
        step={{ id: 'p2', index: 1, instruction: 'Turn', status: 'todo' }}
        total={3}
      />,
    );
    expect(screen.getByRole('button', { name: 'Work on step 2' })).toBeOnTheScreen();

    await rerender(
      <PatternViewerStepRow
        onComplete={jest.fn()}
        onReopen={jest.fn()}
        onSelect={jest.fn()}
        step={{ id: 'p2', index: 1, instruction: 'Turn', status: 'current' }}
        total={3}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Work on step 2' })).not.toBeOnTheScreen();
  });
});
