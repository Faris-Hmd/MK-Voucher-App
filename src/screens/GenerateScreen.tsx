import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { globalStyles, colors } from '../theme';
import { fetchProfilesAPI, createProfileAPI, createVouchersAPI } from '../api';

export default function GenerateScreen() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileValidity, setNewProfileValidity] = useState('');
  
  const [voucherCount, setVoucherCount] = useState('50');
  const [voucherLength, setVoucherLength] = useState('6');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const p = await fetchProfilesAPI();
      setProfiles(p);
      if (p.length > 0) setSelectedProfile(p[0]);
    } catch (e) {
      console.log('Failed to load profiles (Router might not be configured)');
    }
  };

  const handleCreateProfile = async () => {
    if (!newProfileName || !newProfileValidity) {
      Alert.alert("Error", "Name and Validity are required.");
      return;
    }
    setIsCreatingProfile(true);
    try {
      await createProfileAPI(newProfileName, newProfileValidity);
      Alert.alert("Success", "Profile Created!");
      setNewProfileName('');
      setNewProfileValidity('');
      loadProfiles();
    } catch(err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedProfile) {
      Alert.alert("Error", "Please select or create a profile first.");
      return;
    }
    setIsGenerating(true);
    try {
      const results = await createVouchersAPI(selectedProfile, parseInt(voucherCount), parseInt(voucherLength));
      Alert.alert("Success", `Successfully generated ${results.length} vouchers!`);
    } catch(err: any) {
      Alert.alert("Generation Failed", err.message || "Failed to generate vouchers. Ensure router is reachable.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ScrollView style={globalStyles.content}>
      <Text style={globalStyles.title}>Generator</Text>

      <View style={globalStyles.card}>
        <Text style={globalStyles.label}>Create New Profile</Text>
        <TextInput 
          style={globalStyles.input}
          placeholder="Profile Name (e.g. 1-Hour)"
          placeholderTextColor={colors.textMuted}
          value={newProfileName}
          onChangeText={setNewProfileName}
        />
        <TextInput 
          style={globalStyles.input}
          placeholder="Validity (e.g. 1h, 1d, 30d)"
          placeholderTextColor={colors.textMuted}
          value={newProfileValidity}
          onChangeText={setNewProfileValidity}
        />
        <TouchableOpacity style={globalStyles.button} onPress={handleCreateProfile} disabled={isCreatingProfile}>
          {isCreatingProfile ? <ActivityIndicator color="#fff" /> : <Text style={globalStyles.buttonText}>Create Profile</Text>}
        </TouchableOpacity>
      </View>

      <View style={globalStyles.card}>
        <Text style={globalStyles.label}>Generate Vouchers</Text>
        
        {/* Simple mock select using multiple buttons since Native picker requires extra libs */}
        <Text style={globalStyles.label}>Target Profile</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 }}>
          {profiles.map(p => (
            <TouchableOpacity 
              key={p} 
              style={{
                backgroundColor: selectedProfile === p ? colors.primary : 'rgba(255,255,255,0.1)',
                padding: 10, borderRadius: 8, marginRight: 10, marginBottom: 10
              }}
              onPress={() => setSelectedProfile(p)}
            >
              <Text style={{color: '#fff'}}>{p}</Text>
            </TouchableOpacity>
          ))}
          {profiles.length === 0 && <Text style={{color: colors.textMuted}}>No profiles found</Text>}
        </View>

        <Text style={globalStyles.label}>Number of Vouchers</Text>
        <TextInput 
          style={globalStyles.input}
          value={voucherCount}
          onChangeText={setVoucherCount}
          keyboardType="numeric"
        />

        <Text style={globalStyles.label}>Code Length</Text>
        <TextInput 
          style={globalStyles.input}
          value={voucherLength}
          onChangeText={setVoucherLength}
          keyboardType="numeric"
        />

        <TouchableOpacity 
          style={[globalStyles.button, (!selectedProfile || isGenerating) && globalStyles.buttonDisabled]} 
          onPress={handleGenerate}
          disabled={!selectedProfile || isGenerating}
        >
          {isGenerating ? <ActivityIndicator color="#fff" /> : <Text style={globalStyles.buttonText}>Generate</Text>}
        </TouchableOpacity>
      </View>
      <View style={{height: 50}} />
    </ScrollView>
  );
}
