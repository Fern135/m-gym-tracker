/**
 * @file media.ts
 * @description How-to videos for exercises: recording or picking one, and
 * keeping our own copy. Every video is copied into the app's document
 * directory on import, so deleting it from the camera roll never breaks an exercise.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';

/** Clips are meant to show one movement; longer ones waste storage. */
export const MAX_VIDEO_SECONDS = 30;
const VIDEO_DIR = 'exercise-videos';

/**
 * Random v4-style UUID for video filenames.
 * shortcut: Math.random, fine for unique filenames (not security); use expo-crypto if ids ever need to be unguessable.
 * @returns e.g. "3f2a…-4…"
 */
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/**
 * Records a video or picks one from the library.
 * @param source - 'camera' or 'library'
 * @returns The picked video's temporary URI (import it before use), or null if cancelled
 * @throws If camera permission is denied or the clip is longer than MAX_VIDEO_SECONDS
 */
export async function pickVideo(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const { granted } = await requestCameraPermissionsAsync();
    if (!granted) throw new Error('Camera access is off. Turn it on in your device Settings to record a video.');
  }
  const options = { mediaTypes: 'videos' as const, videoMaxDuration: MAX_VIDEO_SECONDS, quality: 0.7 };
  const result = source === 'camera' ? await launchCameraAsync(options) : await launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  // The camera stops itself at the limit; library clips have to be checked. duration is in ms.
  if ((asset.duration ?? 0) > MAX_VIDEO_SECONDS * 1000 + 500) {
    throw new Error(`That video is ${Math.round((asset.duration ?? 0) / 1000)} s long. Pick one that's ${MAX_VIDEO_SECONDS} s or shorter.`);
  }
  return asset.uri;
}

/**
 * Copies a picked video into DocumentDirectory/exercise-videos/ under a UUID name.
 * The returned path is relative: on iOS the document directory's absolute path
 * changes between app updates, so only the relative part is stored.
 * @param uri - Source URI from the picker
 * @returns Relative path, e.g. "exercise-videos/3f2a….mp4"
 */
export async function importVideo(uri: string): Promise<string> {
  const dir = new Directory(Paths.document, VIDEO_DIR);
  dir.create({ idempotent: true, intermediates: true });
  const ext = /\.(mp4|mov|m4v|3gp|webm)$/i.exec(uri)?.[0].toLowerCase() ?? '.mp4';
  const name = `${uuid()}${ext}`;
  await new File(uri).copy(new File(dir, name));
  return `${VIDEO_DIR}/${name}`;
}

/**
 * Resolves a stored relative path to a playable URI.
 * @param path - Relative path from template_exercises.video_path
 * @returns file:// URI, or null if the file is gone
 */
export function mediaUri(path: string): string | null {
  const f = new File(Paths.document, path);
  return f.exists ? f.uri : null;
}

/**
 * Deletes a media file; a missing file is not an error.
 * @param path - Relative path
 */
export function deleteMediaFile(path: string): void {
  const f = new File(Paths.document, path);
  if (f.exists) f.delete();
}

/** No answer within this long counts as "too slow to watch videos". */
const SLOW_MS = 3000;

/**
 * Checks whether the internet is good enough for an online video search.
 * shortcut: one tiny request with a timeout stands in for a speed test; use a real bandwidth check if users report false alarms.
 * @returns 'bad' when there's no connection or it's slower than SLOW_MS, else 'ok'
 */
export async function checkInternet(): Promise<'ok' | 'bad'> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SLOW_MS);
  try {
    const r = await fetch('https://www.youtube.com/generate_204', { method: 'HEAD', signal: abort.signal, cache: 'no-store' });
    return r.ok ? 'ok' : 'bad';
  } catch {
    return 'bad';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deletes every exercise video (used by "Clear everything").
 */
export function deleteAllMedia(): void {
  const dir = new Directory(Paths.document, VIDEO_DIR);
  if (dir.exists) dir.delete();
}
