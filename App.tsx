import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MellowMaker</Text>
      <Text style={styles.subtitle}>Ready to make something.</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F8F6',
    padding: 24,
  },
  title: {
    color: '#26547C',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#26547C',
    fontSize: 16,
    marginTop: 8,
  },
});
