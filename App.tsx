import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { DB_NAME, migrateDbIfNeeded } from './src/db/database';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </SQLiteProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
