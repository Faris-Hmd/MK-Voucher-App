import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView, TouchableOpacity, Text } from 'react-native';
import { useState } from 'react';
import { globalStyles, colors } from './src/theme';

import GenerateScreen from './src/screens/GenerateScreen';
import ListScreen from './src/screens/ListScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<'generate'|'list'|'settings'>('generate');

  const renderScreen = () => {
    switch (activeTab) {
      case 'generate': return <GenerateScreen />;
      case 'list': return <ListScreen />;
      case 'settings': return <SettingsScreen />;
    }
  };

  return (
    <SafeAreaView style={globalStyles.container}>
      <StatusBar style="light" />
      
      {/* Header / Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'generate' && styles.activeTab]} 
          onPress={() => setActiveTab('generate')}
        >
          <Text style={[styles.tabText, activeTab === 'generate' && styles.activeTabText]}>Generate</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'list' && styles.activeTab]} 
          onPress={() => setActiveTab('list')}
        >
          <Text style={[styles.tabText, activeTab === 'list' && styles.activeTabText]}>List & Print</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'settings' && styles.activeTab]} 
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        {renderScreen()}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingBottom: 10,
    gap: 10
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  tabText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.primary,
  }
});
