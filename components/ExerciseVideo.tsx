/**
 * @file ExerciseVideo.tsx
 * @description An exercise's how-to clip, played like a GIF: muted, looping,
 * no controls, and without pausing your music. Tap for full screen.
 */
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { mediaUri } from '../lib/media';

type Props = {
  /** Relative path from template_exercises.video_path. */
  path: string;
  height?: number;
  /** Tap opens full screen; off for small previews inside lists. */
  expandable?: boolean;
};

/**
 * Looping silent exercise clip. Renders nothing if the file is missing.
 * @param props - Video path, height, and whether tapping expands it
 * @returns The clip, or null
 */
export function ExerciseVideo({ path, height = 200, expandable = true }: Props) {
  const uri = mediaUri(path);
  return uri ? <Clip uri={uri} height={height} expandable={expandable} /> : null;
}

/**
 * Plays a resolved clip; split out so the player hook only runs for files that exist.
 * @param props - File URI, height, expandable
 * @returns The clip and its full-screen modal
 */
function Clip({ uri, height, expandable }: { uri: string; height: number; expandable: boolean }) {
  const { colors } = useTheme();
  const [full, setFull] = useState(false);

  return (
    <>
      <Pressable
        onPress={expandable ? () => setFull(true) : undefined}
        disabled={!expandable}
        accessibilityRole="imagebutton"
        accessibilityLabel={expandable ? 'How-to video. Tap to view full screen.' : 'How-to video'}
        style={[styles.frame, { height, backgroundColor: colors.surfaceVariant }]}
      >
        {/* pointerEvents none so taps reach the Pressable, not the native video view. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><Loop uri={uri} fit="cover" /></View>
      </Pressable>
      {expandable && (
        <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}>
          <View style={styles.full}>
            {/* Its own player: on Android one player can't drive two views at once. */}
            {full && <Loop uri={uri} fit="contain" />}
            <IconButton icon="close" iconColor="#fff" size={28} onPress={() => setFull(false)} style={styles.close} accessibilityLabel="Close video" />
          </View>
        </Modal>
      )}
    </>
  );
}

/**
 * A muted, looping video filling its parent.
 * @param props - File URI and how to fit the frame
 * @returns The video view
 */
function Loop({ uri, fit }: { uri: string; fit: 'cover' | 'contain' }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers'; // never pause the user's gym music
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} allowsPictureInPicture={false} />;
}

const styles = StyleSheet.create({
  frame: { borderRadius: 8, overflow: 'hidden' },
  full: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', top: 40, right: 12, backgroundColor: 'rgba(0,0,0,0.4)' },
});
