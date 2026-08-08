import { Redirect } from 'expo-router';

export function InvalidRouteTypeContract() {
  // This directive must become necessary after Expo generates the app's route union.
  // @ts-expect-error nonexistent routes must not satisfy Expo Router's href contract
  return <Redirect href="/definitely-not-a-route" />;
}
