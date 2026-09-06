import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type {
  FetchGuideMetadataResult,
  GuideMetadataGateway,
} from '@/data/contracts/guideMetadataGateway';
import { GuideImportScreen } from '@/features/guides/presentation/GuideImportScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';
import { GuideMetadataContext } from '@/ui/guides/guideMetadataContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function fakeGateway(result: FetchGuideMetadataResult): GuideMetadataGateway {
  return { fetchMetadata: jest.fn(async () => result) };
}

function tree(repositories: Repositories, gateway: GuideMetadataGateway) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <GuideMetadataContext.Provider value={gateway}>
          <GuideImportScreen />
        </GuideMetadataContext.Provider>
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

const OK_RESULT: FetchGuideMetadataResult = {
  status: 'ok',
  metadata: {
    title: 'Granny Square',
    creator: 'Yarn Co',
    creatorUrl: 'https://youtube.com/@yarnco',
    thumbnailUrl: 'https://i.ytimg.com/x.jpg',
  },
};

describe('GuideImportScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;

  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    database = createTestDatabase();
    repositories = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('rejects a bad link with a message and writes nothing', async () => {
    const gateway = fakeGateway(OK_RESULT);
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'not a link',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(gateway.fetchMetadata).not.toHaveBeenCalled();
    // Still on the input phase: the URL field remains editable.
    expect(screen.getByLabelText('YouTube link')).toBeOnTheScreen();
  });

  it('advances a valid fresh link to the review form (no false rejection)', async () => {
    const gateway = fakeGateway(OK_RESULT);
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    // Reaches review with the metadata prefilled — no url-error shown.
    expect(await screen.findByLabelText('Guide title')).toHaveDisplayValue(
      'Granny Square',
    );
    expect(screen.getByLabelText('Guide creator')).toHaveDisplayValue('Yarn Co');
  });

  it('creates a guide from fetched metadata only on the explicit Create tap', async () => {
    const gateway = fakeGateway(OK_RESULT);
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));
    await screen.findByLabelText('Guide title');

    // Reaching review has written nothing yet.
    expect(saveSpy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Create guide' }));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({
      guide: expect.objectContaining({
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Granny Square',
        creator: 'Yarn Co',
        thumbnailUrl: 'https://i.ytimg.com/x.jpg',
        metadataSyncedAt: expect.any(Number),
      }),
      steps: [],
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('lets a maker create manually when metadata is unavailable, with no premature write', async () => {
    const gateway = fakeGateway({ status: 'unavailable', reason: 'offline' });
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://youtu.be/dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    // The non-blocking note appears and the fields are blank + editable.
    expect(
      await screen.findByText(/you can still create this guide/i),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Guide title')).toHaveDisplayValue('');
    // Create is disabled until a title is entered, and nothing is written yet.
    expect(
      screen.getByRole('button', { name: 'Create guide' }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(saveSpy).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByLabelText('Guide title'),
      'Amigurumi Basics',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create guide' }));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const arg = saveSpy.mock.calls[0]?.[0];
    expect(arg?.guide.title).toBe('Amigurumi Basics');
    expect(arg?.guide.creator).toBeUndefined();
    expect('thumbnailUrl' in (arg?.guide ?? {})).toBe(false);
    expect('metadataSyncedAt' in (arg?.guide ?? {})).toBe(false);
  });

  it('lands on the existing guide for an already-imported video without creating a duplicate', async () => {
    const existing = repositories.guides.saveImportedGuide({
      guide: {
        videoId: 'dQw4w9WgXcQ',
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Already Here',
      },
      steps: [],
    });
    const gateway = fakeGateway(OK_RESULT);
    const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
    await render(tree(repositories, gateway));

    await fireEvent.changeText(
      screen.getByLabelText('YouTube link'),
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Look up video' }));

    expect(
      await screen.findByRole('button', { name: 'Open guide' }),
    ).toBeOnTheScreen();
    // No duplicate create, and no network call for a known video.
    expect(saveSpy).not.toHaveBeenCalled();
    expect(gateway.fetchMetadata).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Open guide' }));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/guides/[guideId]',
      params: { guideId: existing.guide.id },
    });
  });

  describe('a pasted ?t= start time seeds no step (issue #50, contract gap 2)', () => {
    it('imports with steps: [] and never authors a step the maker did not write', async () => {
      const gateway = fakeGateway(OK_RESULT);
      const saveSpy = jest.spyOn(repositories.guides, 'saveImportedGuide');
      await render(tree(repositories, gateway));

      await fireEvent.changeText(
        screen.getByLabelText('YouTube link'),
        'https://youtu.be/dQw4w9WgXcQ?t=42',
      );
      await fireEvent.press(
        screen.getByRole('button', { name: 'Look up video' }),
      );
      await screen.findByLabelText('Guide title');
      await fireEvent.press(
        screen.getByRole('button', { name: 'Create guide' }),
      );

      // `startSeconds` is parsed by `normalizeYoutubeUrl` and deliberately not
      // consumed: a step needs a non-empty instruction, and `?t=` carries no
      // text, so seeding one would make the app author words the maker never
      // typed or pasted.
      expect(saveSpy).toHaveBeenCalledTimes(1);
      const argument = saveSpy.mock.calls[0]?.[0];
      expect(argument?.steps).toStrictEqual([]);
      expect(argument?.guide.videoId).toBe('dQw4w9WgXcQ');
      // The timestamp is dropped from identity too.
      expect(argument?.guide.sourceUrl).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );

      const saved = repositories.guides.findGuideByVideoId('dQw4w9WgXcQ');
      expect(saved?.steps).toStrictEqual([]);
    });

    it('still lets the maker put a step at that time by hand or by paste', async () => {
      // The scenario the settlement must not break: refusing to auto-seed takes
      // nothing away — the maker reaches 0:42 by typing it, and a pasted
      // chapter list still lands its own offsets.
      const guideId = repositories.guides.saveImportedGuide({
        guide: {
          videoId: 'dQw4w9WgXcQ',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Amigurumi Basics',
        },
        steps: [],
      }).guide.id;

      repositories.guides.addGuideStep(guideId, {
        instruction: 'Start here',
        videoOffsetMs: 42000,
      });
      repositories.guides.appendImportedGuideSteps(guideId, [
        { instruction: 'Materials', videoOffsetMs: 0 },
      ]);

      const steps = repositories.guides.getGuideWithSteps(guideId)?.steps ?? [];
      expect(
        steps.map((step) => [step.videoOffsetMs, step.origin]),
      ).toStrictEqual([
        [42000, 'user'],
        [0, 'import'],
      ]);
    });
  });

  describe('a repeated identical rejection on the link field (issue #66)', () => {
    // Two gaps PR #69's verify found and rated non-blocking, closed together
    // by the #66 retro. M-G deleted `UrlEntryForm`'s `setAttempt` bump and the
    // suite stayed green; M-J re-added the parent screen's deleted `urlError`
    // announcement — the exact iOS double-speak the PR body warns about — and
    // the suite stayed green too, because nothing here counted utterances.
    let announce: jest.SpyInstance;

    beforeEach(() => {
      announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      announce.mockClear();
    });

    async function lookUp(link: string) {
      await fireEvent.changeText(screen.getByLabelText('YouTube link'), link);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Look up video' }),
      );
    }

    it('speaks a rejected link exactly once, from the field and not the screen', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await render(tree(repositories, fakeGateway(OK_RESULT)));

      await lookUp('not a link');

      // One utterance, not two: `UrlEntryForm` owns the rejection through
      // `CraftInlineError`, and the screen no longer announces it as well.
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        screen.getByRole('alert').props.children,
      );
    });

    it('falsifier: looking up the same bad link twice announces twice', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await render(tree(repositories, fakeGateway(OK_RESULT)));

      await lookUp('not a link');
      const message = screen.getByRole('alert').props.children;

      // Nothing edited in between: the rejection is already on screen, so the
      // attempt is the only thing that can make the app answer again.
      await fireEvent.press(
        screen.getByRole('button', { name: 'Look up video' }),
      );

      expect(announce.mock.calls.map(([text]) => text)).toStrictEqual([
        message,
        message,
      ]);
    });

    it('negative branch: editing the link without submitting stays silent', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await render(tree(repositories, fakeGateway(OK_RESULT)));

      await lookUp('not a link');
      expect(announce).toHaveBeenCalledTimes(1);

      await fireEvent.changeText(
        screen.getByLabelText('YouTube link'),
        'still not a link',
      );

      expect(announce).toHaveBeenCalledTimes(1);
    });

    it('Android: the announcer never fires, and the alert identity advances', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      await render(tree(repositories, fakeGateway(OK_RESULT)));

      await lookUp('not a link');
      const first = screen.getByRole('alert').props.nativeID;

      await fireEvent.press(
        screen.getByRole('button', { name: 'Look up video' }),
      );

      expect(announce).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').props.nativeID).not.toBe(first);
    });
  });
});
