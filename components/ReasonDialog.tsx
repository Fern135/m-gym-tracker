/**
 * @file ReasonDialog.tsx
 * @description Asks "why?" with quick-pick reasons plus a free-text box.
 * Used for skipping a workout and for explaining missed weeks.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, Portal, Text, TextInput } from 'react-native-paper';

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  presets: string[];
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onDismiss: () => void;
};

/**
 * Reason picker dialog. Confirm stays disabled until a reason is picked or typed.
 * @param props - Title, presets and handlers
 * @returns The dialog
 */
export function ReasonDialog({ visible, title, body, presets, confirmLabel, onConfirm, onDismiss }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  // Start fresh each time it opens.
  useEffect(() => {
    if (visible) { setPicked([]); setOther(''); setBusy(false); }
  }, [visible]);

  const reason = [...picked, other.trim()].filter(Boolean).join(', ');
  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          {body && <Text style={{ marginBottom: 12 }}>{body}</Text>}
          <View style={styles.chips}>
            {presets.map((p) => (
              <Chip key={p} selected={picked.includes(p)} showSelectedCheck onPress={() => toggle(p)}>{p}</Chip>
            ))}
          </View>
          <TextInput mode="outlined" label="Other reason" value={other} onChangeText={setOther} style={{ marginTop: 12 }} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button onPress={confirm} disabled={!reason || busy} loading={busy}>{confirmLabel}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
