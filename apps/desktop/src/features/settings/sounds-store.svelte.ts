import {
  setSoundsMuted,
  soundsMuted,
  setDoneSoundVariant,
  getDoneSoundVariant,
  setArchiveSoundVariant,
  getArchiveSoundVariant,
  setTestSoundVariant,
  getTestSoundVariant,
} from "../../lib/sound/sound-prefs";
import { playButtonClick } from "../../lib/sound/button-click-sound";
import {
  playDoneSound,
  playArchiveSound,
  type DoneSoundVariant,
} from "../../lib/sound/done-sound";
import {
  playTestSound,
  type TestSoundVariant,
} from "../../lib/sound/test-sound";

/**
 * Reactive mirror of the four sound-preference toggles that the Settings
 * "Sounds" group reads/writes. The master mute is shared across the three
 * variant sections (their Play buttons are disabled while muted), so it lives
 * here rather than in each section. Persisting variants immediately calls
 * the `setXxx` prefs helpers; picking one also plays it for a live preview.
 */
let muted = $state(soundsMuted());
let doneVariant = $state(getDoneSoundVariant() as DoneSoundVariant);
let archiveVariant = $state(getArchiveSoundVariant() as DoneSoundVariant);
let testVariant = $state(getTestSoundVariant() as TestSoundVariant);

export const settingsSounds = {
  get muted(): boolean {
    return muted;
  },
  get doneVariant(): DoneSoundVariant {
    return doneVariant;
  },
  get archiveVariant(): DoneSoundVariant {
    return archiveVariant;
  },
  get testVariant(): TestSoundVariant {
    return testVariant;
  },
  toggleMuted(): void {
    muted = !muted;
    setSoundsMuted(muted);
    if (!muted) playButtonClick("click");
  },
  pickDone(value: string): void {
    doneVariant = value as DoneSoundVariant;
    setDoneSoundVariant(doneVariant);
    playDoneSound(doneVariant); // live preview
  },
  previewDone(): void {
    playDoneSound(doneVariant);
  },
  pickArchive(value: string): void {
    archiveVariant = value as DoneSoundVariant;
    setArchiveSoundVariant(archiveVariant);
    playArchiveSound(archiveVariant); // live preview
  },
  previewArchive(): void {
    playArchiveSound(archiveVariant);
  },
  pickTest(value: string): void {
    testVariant = value as TestSoundVariant;
    setTestSoundVariant(testVariant);
    playTestSound(testVariant); // live preview
  },
  previewTest(): void {
    playTestSound(testVariant);
  },
};
