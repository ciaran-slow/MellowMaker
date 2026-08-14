import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type {
  CreatePatternInput,
  PatternStep,
  PatternSummary,
} from '@/data/contracts/patternRepository';
import {
  normalizePatternNotes,
  validatePatternTitle,
  validateStepInstruction,
} from '@/domain/patterns/patternDraft';
import { PatternStepEditorRow } from '@/features/patterns/presentation/PatternStepEditorRow';
import {
  usePatternEditor,
  type PatternEditor,
} from '@/features/patterns/presentation/usePatternEditor';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftConfirmDialog } from '@/ui/components/CraftConfirmDialog';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import { Screen } from '@/ui/components/Screen';
import tokens from '@/ui/theme/tokens.json';

type PatternEditorScreenProps = {
  patternId?: string;
};

export function PatternEditorScreen({ patternId }: PatternEditorScreenProps) {
  const router = useRouter();
  const editor = usePatternEditor(patternId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/patterns');
    }
  }

  function confirmDelete() {
    editor.deletePattern();
    setConfirmingDelete(false);
    router.replace('/patterns');
  }

  const { state } = editor;

  return (
    <View className="flex-1 bg-background">
      <Screen accessibilityLabel="Pattern editor screen">
        <CraftPressable
          accessibilityLabel="Back to patterns"
          className="items-center self-start bg-surface px-4"
          onPress={goBack}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="arrow-left"
            size={tokens.typography.heading.fontSize}
          />
        </CraftPressable>

        {state.status === 'create' ? (
          <CreatePatternForm
            onCreate={editor.createDraftPattern}
            onCreated={(id) => {
              router.replace({
                pathname: '/patterns/[patternId]',
                params: { patternId: id },
              });
            }}
          />
        ) : null}

        {state.status === 'loading' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Loading this pattern"
            accessibilityState={{ busy: true }}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={tokens.colors.teal} size="large" />
          </View>
        ) : null}

        {state.status === 'missing' ? (
          <CraftCard accent="teal">
            <Text accessibilityRole="header" className="text-heading text-ink">
              This pattern is no longer here
            </Text>
            <Text className="text-body text-ink">
              It may have been deleted. Go back to your library to keep making.
            </Text>
          </CraftCard>
        ) : null}

        {state.status === 'failed' ? (
          <>
            <View
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              <CraftCard accent="pink">
                <View className="flex-row items-center gap-3">
                  <MaterialCommunityIcons
                    accessibilityElementsHidden
                    color={tokens.colors.pink}
                    name="alert-circle"
                    size={tokens.typography.heading.fontSize}
                  />
                  <Text
                    accessibilityRole="header"
                    className="flex-1 text-heading text-ink"
                  >
                    We couldn&apos;t save that change
                  </Text>
                </View>
                <Text className="text-body text-ink">
                  Your pattern is saved on this device. Try again — nothing was
                  lost.
                </Text>
              </CraftCard>
            </View>
            <CraftPressable
              accessibilityLabel="Try again"
              className="items-center bg-yellow px-6 py-3"
              onPress={editor.retry}
            >
              <Text className="text-label text-ink">Try again</Text>
            </CraftPressable>
          </>
        ) : null}

        {state.status === 'ready' ? (
          <EditPatternForm
            editor={editor}
            pattern={state.pattern}
            steps={state.steps}
            onRequestDelete={() => {
              setConfirmingDelete(true);
            }}
          />
        ) : null}
      </Screen>

      <CraftConfirmDialog
        body="Deleting this pattern permanently removes it and all of its saved progress from this device. This can't be undone."
        cancelLabel="Keep pattern"
        confirmLabel="Yes, delete pattern"
        onCancel={() => {
          setConfirmingDelete(false);
        }}
        onConfirm={confirmDelete}
        title="Delete this pattern?"
        visible={confirmingDelete}
      />
    </View>
  );
}

type CreatePatternFormProps = {
  onCreate: PatternEditor['createDraftPattern'];
  onCreated(id: string): void;
};

function CreatePatternForm({ onCreate, onCreated }: CreatePatternFormProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [steps, setSteps] = useState<readonly string[]>([]);

  const titleResult = validatePatternTitle(title);

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) {
      return;
    }

    const reordered = [...steps];
    const moved = reordered[from];
    const displaced = reordered[to];
    if (moved === undefined || displaced === undefined) {
      return;
    }
    reordered[from] = displaced;
    reordered[to] = moved;
    setSteps(reordered);
  }

  function create() {
    if (!titleResult.ok) {
      return;
    }

    const notesValue = normalizePatternNotes(notes);
    const input: CreatePatternInput =
      notesValue === undefined
        ? { title: titleResult.value, steps }
        : { title: titleResult.value, notes: notesValue, steps };

    const id = onCreate(input);
    if (id !== undefined) {
      onCreated(id);
    }
  }

  return (
    <View className="gap-6">
      <Text accessibilityRole="header" className="text-display text-ink">
        New pattern
      </Text>

      <View className="gap-3">
        <Text className="text-label text-ink">Title</Text>
        <CraftTextField
          accessibilityLabel="Pattern title"
          autoCapitalize="sentences"
          autoCorrect
          icon="format-title"
          onChangeText={setTitle}
          placeholder="Name your pattern"
          returnKeyType="done"
          testID="pattern-title-field"
          value={title}
        />
        {titleResult.ok ? null : (
          <Text className="text-label text-pink">{titleResult.message}</Text>
        )}
      </View>

      <NotesField notes={notes} onChangeNotes={setNotes} />

      <StepsSection
        steps={steps.map((instruction, index) => ({
          key: `draft-${index}`,
          instruction,
        }))}
        onEdit={(index, instruction) => {
          setSteps((previous) =>
            previous.map((existing, position) =>
              position === index ? instruction : existing,
            ),
          );
        }}
        onDelete={(index) => {
          setSteps((previous) =>
            previous.filter((_unused, position) => position !== index),
          );
        }}
        onMoveUp={(index) => {
          moveStep(index, index - 1);
        }}
        onMoveDown={(index) => {
          moveStep(index, index + 1);
        }}
        onAdd={(instruction) => {
          setSteps((previous) => [...previous, instruction]);
        }}
      />

      <CraftPressable
        accessibilityLabel="Create pattern"
        className="items-center bg-pink px-6 py-3"
        disabled={!titleResult.ok}
        onPress={create}
      >
        <Text className="text-label text-ink">Create pattern</Text>
      </CraftPressable>
    </View>
  );
}

type EditPatternFormProps = {
  editor: PatternEditor;
  pattern: PatternSummary;
  steps: readonly PatternStep[];
  onRequestDelete(): void;
};

function EditPatternForm({
  editor,
  pattern,
  steps,
  onRequestDelete,
}: EditPatternFormProps) {
  // Seeded once on entering edit mode; a step mutation re-reads the pattern but
  // must not clobber an in-progress title or notes edit.
  const [title, setTitle] = useState(pattern.title);
  const [notes, setNotes] = useState(pattern.notes ?? '');

  const titleResult = validatePatternTitle(title);

  function saveDetails() {
    if (!titleResult.ok) {
      return;
    }

    editor.saveDetails({
      title: titleResult.value,
      notes: normalizePatternNotes(notes),
    });
  }

  return (
    <View className="gap-6">
      <Text accessibilityRole="header" className="text-display text-ink">
        Edit pattern
      </Text>

      <View className="gap-3">
        <Text className="text-label text-ink">Title</Text>
        <CraftTextField
          accessibilityLabel="Pattern title"
          autoCapitalize="sentences"
          autoCorrect
          icon="format-title"
          onChangeText={setTitle}
          placeholder="Name your pattern"
          returnKeyType="done"
          testID="pattern-title-field"
          value={title}
        />
        {titleResult.ok ? null : (
          <Text className="text-label text-pink">{titleResult.message}</Text>
        )}
      </View>

      <NotesField notes={notes} onChangeNotes={setNotes} />

      <CraftPressable
        accessibilityLabel="Save details"
        className="items-center bg-teal px-6 py-3"
        disabled={!titleResult.ok}
        onPress={saveDetails}
      >
        <Text className="text-label text-ink">Save details</Text>
      </CraftPressable>

      <StepsSection
        steps={steps.map((step) => ({
          key: step.id,
          instruction: step.instruction,
        }))}
        onEdit={(index, instruction) => {
          const step = steps[index];
          if (step !== undefined) {
            editor.editStep(step.id, instruction);
          }
        }}
        onDelete={(index) => {
          const step = steps[index];
          if (step !== undefined) {
            editor.deleteStep(step.id);
          }
        }}
        onMoveUp={(index) => {
          const step = steps[index];
          if (step !== undefined) {
            editor.moveStepUp(step.id);
          }
        }}
        onMoveDown={(index) => {
          const step = steps[index];
          if (step !== undefined) {
            editor.moveStepDown(step.id);
          }
        }}
        onAdd={(instruction) => {
          editor.addStep(instruction);
        }}
      />

      <CraftPressable
        accessibilityHint="Removes this pattern and its progress"
        accessibilityLabel="Delete pattern"
        className="items-center bg-surface px-6 py-3"
        onPress={onRequestDelete}
      >
        <Text className="text-label text-pink">Delete pattern</Text>
      </CraftPressable>
    </View>
  );
}

type NotesFieldProps = {
  notes: string;
  onChangeNotes(value: string): void;
};

function NotesField({ notes, onChangeNotes }: NotesFieldProps) {
  return (
    <View className="gap-3">
      <Text className="text-label text-ink">Notes (optional)</Text>
      <CraftTextField
        accessibilityLabel="Pattern notes"
        autoCapitalize="sentences"
        autoCorrect
        icon="note-text-outline"
        multiline
        onChangeText={onChangeNotes}
        placeholder="Hook size, yarn, reminders…"
        returnKeyType="default"
        testID="pattern-notes-field"
        value={notes}
      />
    </View>
  );
}

type StepsSectionProps = {
  steps: readonly { readonly key: string; readonly instruction: string }[];
  onEdit(index: number, instruction: string): void;
  onDelete(index: number): void;
  onMoveUp(index: number): void;
  onMoveDown(index: number): void;
  onAdd(instruction: string): void;
};

function StepsSection({
  onAdd,
  onDelete,
  onEdit,
  onMoveDown,
  onMoveUp,
  steps,
}: StepsSectionProps) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-heading text-ink">
        Steps
      </Text>
      {steps.length === 0 ? (
        <Text className="text-body text-ink opacity-70">
          No steps yet. Add the first one below.
        </Text>
      ) : (
        steps.map((step, index) => (
          <PatternStepEditorRow
            canMoveDown={index < steps.length - 1}
            canMoveUp={index > 0}
            index={index}
            instruction={step.instruction}
            key={step.key}
            onDelete={() => {
              onDelete(index);
            }}
            onEdit={(instruction) => {
              onEdit(index, instruction);
            }}
            onMoveDown={() => {
              onMoveDown(index);
            }}
            onMoveUp={() => {
              onMoveUp(index);
            }}
            total={steps.length}
          />
        ))
      )}
      <AddStepField onAdd={onAdd} />
    </View>
  );
}

type AddStepFieldProps = {
  onAdd(instruction: string): void;
};

function AddStepField({ onAdd }: AddStepFieldProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function submit() {
    const result = validateStepInstruction(value);
    if (!result.ok) {
      setError(result.message);

      return;
    }

    onAdd(result.value);
    setValue('');
    setError(undefined);
  }

  return (
    <View className="gap-3">
      <CraftTextField
        accessibilityLabel="New step instruction"
        autoCapitalize="sentences"
        autoCorrect
        icon="format-list-numbered"
        multiline
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder="What does the next step do?"
        returnKeyType="done"
        testID="pattern-step-field"
        value={value}
      />
      {error === undefined ? null : (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          className="text-label text-pink"
        >
          {error}
        </Text>
      )}
      <CraftPressable
        accessibilityLabel="Add step"
        className="items-center bg-teal px-6 py-3"
        onPress={submit}
      >
        <Text className="text-label text-ink">Add step</Text>
      </CraftPressable>
    </View>
  );
}
