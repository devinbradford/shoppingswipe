import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateView } from '@/components/StateView';
import { colors } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StateView
        icon="search"
        title="Page not found"
        message="This link doesn't go anywhere in Swipeshop."
        primary={{ label: 'Go to discover', onPress: () => router.replace('/') }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background } });
