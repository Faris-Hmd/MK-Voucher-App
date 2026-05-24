import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { formatUptimeAPI } from '../api';

interface StatsScreenProps {
  resources: any;
  health: any;
  getTemperature: () => string | null;
  isConnected: boolean | null;
}

export default function StatsScreen({ resources, health, getTemperature, isConnected }: StatsScreenProps) {
  const { colors, styles } = useTheme();

  if (!isConnected) {
    return (
      <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.textMuted} />
        <Text style={[styles.label, { marginTop: 16, color: colors.textMuted }]}>
          Connect to a router to see stats
        </Text>
      </View>
    );
  }

  if (!resources) {
    return (
      <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>Loading resources...</Text>
      </View>
    );
  }

  const cpuLoad = parseInt(resources['cpu-load'] || '0');
  const totalMem = parseInt(resources['total-memory'] || '1');
  const freeMem = parseInt(resources['free-memory'] || '0');
  const usedMem = totalMem - freeMem;
  const memPercent = (usedMem / totalMem) * 100;

  const totalDisk = parseInt(resources['total-hdd-space'] || '1');
  const freeDisk = parseInt(resources['free-hdd-space'] || '0');
  const usedDisk = totalDisk - freeDisk;
  const diskPercent = (usedDisk / totalDisk) * 100;

  const temp = getTemperature();

  const ProgressBar = ({ value, label, subLabel, icon, color }: { value: number, label: string, subLabel: string, icon: string, color?: string }) => (
    <View style={localStyles.progressContainer}>
      <View style={localStyles.progressHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={icon as any} size={18} color={color || colors.primary} />
          <Text style={[localStyles.progressLabel, { color: colors.foreground }]}>{label}</Text>
        </View>
        <Text style={[localStyles.progressValue, { color: color || colors.primary }]}>{Math.round(value)}%</Text>
      </View>
      <View style={[localStyles.progressTrack, { backgroundColor: colors.glassBorder }]}>
        <View style={[localStyles.progressFill, { width: `${value}%`, backgroundColor: color || colors.primary }]} />
      </View>
      <Text style={[localStyles.progressSubLabel, { color: colors.textMuted }]}>{subLabel}</Text>
    </View>
  );

  const InfoRow = ({ label, value, icon }: { label: string, value: string, icon: string }) => (
    <View style={localStyles.infoRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon as any} size={16} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      
      {/* Performance Overview */}
      <View style={styles.card}>
        <Text style={[styles.label, { marginBottom: 16 }]}>Performance</Text>
        
        <ProgressBar 
          value={cpuLoad} 
          label="CPU Load" 
          subLabel={`${resources['cpu']} @ ${resources['cpu-frequency']}MHz (${resources['cpu-count']} cores)`}
          icon="hardware-chip-outline"
          color={cpuLoad > 80 ? '#ef4444' : cpuLoad > 50 ? '#f59e0b' : colors.primary}
        />

        <View style={{ height: 24 }} />

        <ProgressBar 
          value={memPercent} 
          label="Memory (RAM)" 
          subLabel={`${Math.round(usedMem / 1024 / 1024)}MB used of ${Math.round(totalMem / 1024 / 1024)}MB`}
          icon="pie-chart-outline"
          color={memPercent > 90 ? '#ef4444' : colors.primary}
        />

        <View style={{ height: 24 }} />

        <ProgressBar 
          value={diskPercent} 
          label="Storage (HDD)" 
          subLabel={`${Math.round(freeDisk / 1024 / 1024)}MB free of ${Math.round(totalDisk / 1024 / 1024)}MB`}
          icon="save-outline"
          color={diskPercent > 90 ? '#ef4444' : '#22c55e'}
        />
      </View>

      {/* System Details */}
      <View style={styles.card}>
        <Text style={[styles.label, { marginBottom: 16 }]}>System Identity</Text>
        <InfoRow label="Model" value={resources['board-name']} icon="cube-outline" />
        <InfoRow label="Architecture" value={resources['architecture-name']} icon="git-network-outline" />
        <InfoRow label="RouterOS" value={resources['version']} icon="code-working-outline" />
        <InfoRow label="Uptime" value={formatUptimeAPI(resources['uptime'])} icon="time-outline" />
        {temp && (
          <InfoRow 
            label="Temperature" 
            value={`${temp}°C`} 
            icon="thermometer-outline" 
          />
        )}
      </View>

      {/* Hardware Health Card (Extra metrics if available) */}
      <View style={styles.card}>
        <Text style={[styles.label, { marginBottom: 16 }]}>Hardware Status</Text>
        <InfoRow label="Build Time" value={resources['build-time'] || 'N/A'} icon="calendar-outline" />
        <InfoRow label="Factory OS" value={resources['factory-software'] || 'N/A'} icon="construct-outline" />
        <InfoRow label="Bad Blocks" value={`${resources['bad-blocks']}%`} icon="alert-circle-outline" />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  progressContainer: {
    width: '100%',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressSubLabel: {
    fontSize: 11,
    marginTop: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
});
