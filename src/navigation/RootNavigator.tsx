import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import ListsScreen from '../screens/ListsScreen';
import ListDetailScreen from '../screens/ListDetailScreen';
import ScanScreen from '../screens/ScanScreen';
import HistoryScreen from '../screens/HistoryScreen';
import HistoryDetailScreen from '../screens/HistoryDetailScreen';
import ListReportScreen from '../screens/ListReportScreen';
import ListVsReceiptScreen from '../screens/ListVsReceiptScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Lists">
      <Stack.Screen name="Lists" component={ListsScreen} options={{ title: 'Minhas Listas' }} />
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        options={{ title: 'Lista de Compras' }}
      />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Fechar Compra', presentation: 'modal' }}
      />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Histórico' }} />
      <Stack.Screen
        name="HistoryDetail"
        component={HistoryDetailScreen}
        options={{ title: 'Detalhe da Compra' }}
      />
      <Stack.Screen
        name="ListReport"
        component={ListReportScreen}
        options={{ title: 'Relatório da Lista' }}
      />
      <Stack.Screen
        name="ListVsReceipt"
        component={ListVsReceiptScreen}
        options={{ title: 'Lista x Cupom' }}
      />
    </Stack.Navigator>
  );
}
