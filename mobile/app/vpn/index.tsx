import { Redirect } from 'expo-router';

/** VPN routes from the legacy bundle are intentionally outside the OSGARD app. */
export default function LegacyVpnRoute() {
  return <Redirect href="/(tabs)" />;
}
