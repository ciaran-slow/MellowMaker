export interface PatternProgress {
  readonly patternId: string;
  /** Cleared automatically when the step it pointed at is deleted. */
  readonly activeStepId: string | undefined;
  readonly completedStepIds: readonly string[];
}

export interface ProgressRepository {
  getProgress(patternId: string): PatternProgress;
  /** One statement, so rapid completion taps cannot lose an update. */
  setStepCompleted(stepId: string, completed: boolean): void;
  setActiveStep(patternId: string, stepId: string | null): void;
}
