/**
 * @file index.tsx
 * @description Entry route; sends the app straight to the Today tab.
 */
import { Redirect } from 'expo-router';

/**
 * @returns A redirect to the Today tab
 */
export default function Index() {
  return <Redirect href="/today" />;
}
