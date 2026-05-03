import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { globalStyles, colors } from '../theme';
import { saveConfig, loadConfig, RouterConfig } from '../store';

export default function SettingsScreen() {
  const [ip, setIp] = useState('192.168.1.56');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('');
  
  useEffect(() => {
    (async () => {
      const conf = await loadConfig();
      if (conf) {
        setIp(conf.ip);
        setUser(conf.user);
        setPass(conf.pass);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!ip || !user) {
      Alert.alert("Error", "IP and User are required");
      return;
    }
    await saveConfig({ ip, user, pass });
    Alert.alert("Success", "Router Configuration Saved!");
  };

  return (
    <View style={globalStyles.content}>
      <Text style={globalStyles.title}>Router Setup</Text>
      
      <View style={globalStyles.card}>
        <Text style={globalStyles.label}>Router IP Address</Text>
        <TextInput 
          style={globalStyles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="e.g. 192.168.1.1"
          placeholderTextColor={colors.textMuted}
          keyboardType="url"
        />
        
        <Text style={globalStyles.label}>API Username</Text>
        <TextInput 
          style={globalStyles.input}
          value={user}
          onChangeText={setUser}
          placeholderTextColor={colors.textMuted}
        />
        
        <Text style={globalStyles.label}>API Password</Text>
        <TextInput 
          style={globalStyles.input}
          value={pass}
          onChangeText={setPass}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />
        
        <TouchableOpacity style={globalStyles.button} onPress={handleSave}>
          <Text style={globalStyles.buttonText}>Save Configuration</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
