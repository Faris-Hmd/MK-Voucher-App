import { loadConfig } from '../store';
import { Buffer } from 'buffer';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const btoa = (input: string) => {
  let str = input;
  let output = '';

  for (let block = 0, charCode, i = 0, map = chars;
    str.charAt(i | 0) || (map = '=', i % 1);
    output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = str.charCodeAt(i += 3 / 4);
    if (charCode > 0xFF) {
      throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
    }
    block = block << 8 | charCode;
  }
  return output;
};

const getAuthHeaders = async () => {
  const config = await loadConfig();
  if (!config) throw new Error("Router not configured. Please go to Settings.");

  const auth = btoa(`${config.user}:${config.pass}`);
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
};

const getBaseUrl = async () => {
  const config = await loadConfig();
  if (!config) throw new Error("Router not configured.");

  let ip = config.ip.trim();
  if (!ip.startsWith('http://') && !ip.startsWith('https://')) {
    ip = `http://${ip}`;
  }
  if (ip.endsWith('/')) {
    ip = ip.slice(0, -1);
  }
  return ip;
};

export const generateRandomString = (length: number): string => {
  const characters = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
};

export const fetchProfilesAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/profile`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch profiles (${res.status}): ${txt.substring(0, 100)}`);
  }
  const data = await res.json();
  console.log("FETCHED_PROFILES_DATA:", JSON.stringify(data));

  const parsedData = data.map((p: any) => {
    let comment = p.comment || '';
    const onLogin = p['on-login'] || '';
    if (onLogin.includes('#METADATA:')) {
      const match = onLogin.match(/#METADATA:([^\r\n]+)/);
      if (match) {
        comment = match[1];
      }
    }
    return {
      ...p,
      comment
    };
  });

  return parsedData.filter((p: any) => p.name !== 'default') as Array<{ '.id': string; name: string;[key: string]: any }>;
};

export const getProfileNamesAPI = async (): Promise<string[]> => {
  const profiles = await fetchProfilesAPI();
  return profiles.map((p) => p.name);
};

export const deleteProfileAPI = async (id: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/profile/remove`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ '.id': id }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete profile (${res.status}): ${txt.substring(0, 100)}`);
  }
};

export const renameProfileAPI = async (id: string, newName: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/profile/set`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ '.id': id, name: newName }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to rename profile (${res.status}): ${txt.substring(0, 100)}`);
  }
};

const parseValidity = (validity: string) => {
  const daysMatch = validity.match(/(\d+)d/);
  const hoursMatch = validity.match(/(\d+)h/);
  const minsMatch = validity.match(/(\d+)m/);

  const days = daysMatch ? parseInt(daysMatch[1]) : 0;
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const mins = minsMatch ? parseInt(minsMatch[1]) : 0;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');

  return { days, time: `${hh}:${mm}:00` };
};

export const generateProfileScript = (validity: string) => {
  if (validity === 'unlimited') {
    return '';
  }
  const { days, time } = parseValidity(validity);

  return `# --- 1. Declare All Variables ---\r\n` +
    `:local addDays ${days};\r\n` +
    `:local addHours ${time};\r\n` +
    `:local userNow $user;\r\n` +
    `:local schedName ("kill_" . $userNow);\r\n` +
    `:local existingSched;\r\n` +
    `:local dateNow;\r\n` +
    `:local timeNow;\r\n` +
    `:local finalTime;\r\n` +
    `:local year;\r\n` +
    `:local month;\r\n` +
    `:local day;\r\n` +
    `:local daysInMonth;\r\n` +
    `:local newDay;\r\n` +
    `:local newMonth;\r\n` +
    `:local newYear;\r\n` +
    `:local dim;\r\n` +
    `:local finalDay;\r\n` +
    `:local finalMonth;\r\n` +
    `:local finalDate;\r\n` +
    `:local onEventText;\r\n\r\n` +
    `# --- 2. Check if the task already exists ---\r\n` +
    `:set existingSched [/system scheduler find name=$schedName];\r\n\r\n` +
    `:if ([:len $existingSched] > 0) do={\r\n` +
    `    :log info ("Hotspot: User $userNow relogged. Expiration timer already exists.");\r\n` +
    `} else={\r\n` +
    `    # --- 3. First Login Logic ---\r\n` +
    `    :set dateNow [/system clock get date];\r\n` +
    `    :set timeNow [/system clock get time];\r\n` +
    `    :set finalTime ($timeNow + $addHours);\r\n\r\n` +
    `    # Handle Time Overflows\r\n` +
    `    :while ($finalTime >= 24:00:00) do={\r\n` +
    `        :set finalTime ($finalTime - 24:00:00);\r\n` +
    `        :set addDays ($addDays + 1);\r\n` +
    `    };\r\n\r\n` +
    `    # Parse ISO Date (yyyy-mm-dd)\r\n` +
    `    :set year [:tonum [:pick $dateNow 0 4]];\r\n` +
    `    :set month [:tonum [:pick $dateNow 5 7]];\r\n` +
    `    :set day [:tonum [:pick $dateNow 8 10]];\r\n\r\n` +
    `    :set daysInMonth [:toarray "31,28,31,30,31,30,31,31,30,31,30,31"];\r\n` +
    `    :set newDay ($day + $addDays);\r\n` +
    `    :set newMonth $month;\r\n` +
    `    :set newYear $year;\r\n\r\n` +
    `    # Calendar Rollover Math\r\n` +
    `    :while ($newDay > 0) do={\r\n` +
    `        :set dim [:tonum [:pick $daysInMonth ($newMonth - 1)]];\r\n` +
    `        :if ($newMonth = 2 && ($newYear % 4 = 0)) do={ :set dim 29 };\r\n\r\n` +
    `        :if ($newDay > $dim) do={\r\n` +
    `            :set newDay ($newDay - $dim);\r\n` +
    `            :set newMonth ($newMonth + 1);\r\n` +
    `            :if ($newMonth > 12) do={\r\n` +
    `                :set newMonth 1;\r\n` +
    `                :set newYear ($newYear + 1);\r\n` +
    `            };\r\n` +
    `        } else={\r\n` +
    `            # Format Final Date and Create Scheduler\r\n` +
    `            :set finalDay [:pick (100 + $newDay) 1 3];\r\n` +
    `            :set finalMonth [:pick (100 + $newMonth) 1 3];\r\n` +
    `            :set finalDate ($newYear . "-" . $finalMonth . "-" . $finalDay);\r\n` +
    `            \r\n` +
    `            # String concatenation for the on-event\r\n` +
    `            :set onEventText ("/ip hotspot active remove [find user=$userNow]; /ip hotspot user remove [find name=$userNow]; /system scheduler remove [find name=$schedName]");\r\n` +
    `            \r\n` +
    `            /system scheduler add name=$schedName start-date=$finalDate start-time=$finalTime interval=0s on-event=$onEventText;\r\n` +
    `            \r\n` +
    `            # Save expiration in comment for the status page timer\r\n` +
    `            :local currentComment [/ip hotspot user get [find name=$userNow] comment];\r\n` +
    `            /ip hotspot user set [find name=$userNow] comment=($currentComment . \" | EXP:\" . $finalDate . \" \" . $finalTime);\r\n` +
    `            \r\n` +
    `            :log info (\"Hotspot: First Login. Voucher $userNow set to die on $finalDate at $finalTime\");\r\n` +
    `            :set newDay 0;\r\n` +
    `        };\r\n` +
    `    };\r\n` +
    `}`;
};

export const createProfileAPI = async (name: string, validity: string, limitMB?: number, isUnlimited?: boolean, printLabel?: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  const parts: string[] = [];
  if (limitMB !== undefined && limitMB > 0) {
    parts.push(`LIMIT:${limitMB}`);
  }
  if (isUnlimited) {
    parts.push(`END_BY_USAGE:true`);
  }
  if (printLabel && printLabel.trim()) {
    parts.push(`PRINT_LABEL:${printLabel.trim()}`);
  }

  const metadataComment = parts.length > 0 ? `#METADATA:${parts.join('|')}\r\n` : '';
  const script = metadataComment + (isUnlimited ? '' : generateProfileScript(validity));

  const body: any = {
    name,
    "shared-users": "1"
  };

  if (script) {
    body["on-login"] = script;
  }

  console.log("SENDING_CREATE_PROFILE_BODY:", JSON.stringify(body));

  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user/profile/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("CREATE_PROFILE_ERROR_BODY:", txt);
    throw new Error(`Failed to create profile (${res.status}): ${txt}`);
  }

  return await res.json();
};

export const createVouchersAPI = async (profile: string, count: number, length: number, comment?: string, limitBytesTotal?: number) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  // 1. Fetch all existing vouchers to ensure uniqueness
  const existingUsers = await fetchVouchersAPI();
  const existingNames = new Set((existingUsers || []).map((u: any) => u.name).filter(Boolean));

  // 2. Generate unique PINs
  const generatedPins: string[] = [];
  const generatedSet = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10;

  while (generatedPins.length < count && attempts < maxAttempts) {
    const pin = generateRandomString(length);
    if (!existingNames.has(pin) && !generatedSet.has(pin)) {
      generatedPins.push(pin);
      generatedSet.add(pin);
    }
    attempts++;
  }

  if (generatedPins.length < count) {
    throw new Error(`Could only generate ${generatedPins.length} unique vouchers. Try increasing voucher length.`);
  }

  // 3. Chunk the PINs to avoid "Payload Too Large" on RouterOS REST API
  const chunks = chunkArray(generatedPins, 250);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const scriptLines = chunk.map(pin => {
      const limitPart = limitBytesTotal ? ` limit-bytes-total=${limitBytesTotal}` : '';
      return `/ip hotspot user add name="${pin}" password="${pin}" profile="${profile}" server="all"${limitPart}${comment ? ` comment="${comment}"` : ''}`;
    });
    const scriptSource = scriptLines.join("\r\n");
    const scriptName = `tmp_vxs_${Date.now()}_${i}`;

    // 4. Create the script on the router
    const addRes = await fetch(`${baseUrl}/rest/system/script/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: scriptName,
        source: scriptSource
      })
    });

    if (!addRes.ok) {
      const txt = await addRes.text();
      throw new Error(`Failed to upload script to router (${addRes.status}): ${txt.substring(0, 100)}`);
    }

    const scriptData = await addRes.json();
    const scriptId = scriptData?.['.id'] || scriptName;

    // 5. Run the script on the router
    let runOk = false;
    let runErrorMsg = '';
    try {
      const runRes = await fetch(`${baseUrl}/rest/system/script/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number: scriptName
        })
      });
      if (runRes.ok) {
        runOk = true;
      } else {
        runErrorMsg = await runRes.text();
      }
    } catch (err: any) {
      runErrorMsg = err.message || "Network error running script";
    }

    // 6. Delete the script from the router
    try {
      const removeRes = await fetch(`${baseUrl}/rest/system/script/remove`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ".id": scriptId
        })
      });
      if (!removeRes.ok) {
        console.warn(`Failed to remove temporary script ${scriptName} (${removeRes.status})`);
      }
    } catch (e) {
      console.warn(`Failed to remove script ${scriptName}`, e);
    }

    // 7. Verify script execution succeeded
    if (!runOk) {
      throw new Error(`Failed to execute script on router: ${runErrorMsg.substring(0, 100)}`);
    }
  }

  return generatedPins;
};

export const fetchVouchersAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/user?.proplist=.id,name,profile,comment,limit-bytes-total`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch users (${res.status}): ${txt.substring(0, 100)}`);
  }
  return await res.json();
};

export const deleteVouchersAPI = async (ids: string[]) => {
  if (!ids || ids.length === 0) return;

  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  // 1. Chunk the IDs to avoid "Payload Too Large" on RouterOS REST API
  const chunks = chunkArray(ids, 250);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const scriptLines = chunk.map(id => `:do { /ip hotspot user remove "${id}" } on-error={}`);
    const scriptSource = scriptLines.join("\r\n");
    const scriptName = `tmp_delete_${Date.now()}_${i}`;

    // 2. Create the script on the router
    const addRes = await fetch(`${baseUrl}/rest/system/script/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: scriptName,
        source: scriptSource
      })
    });

    if (!addRes.ok) {
      const txt = await addRes.text();
      throw new Error(`Failed to upload delete script to router (${addRes.status}): ${txt.substring(0, 100)}`);
    }

    const scriptData = await addRes.json();
    const scriptId = scriptData?.['.id'] || scriptName;

    // 3. Run the script on the router
    let runOk = false;
    let runErrorMsg = '';
    try {
      const runRes = await fetch(`${baseUrl}/rest/system/script/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number: scriptName
        })
      });
      if (runRes.ok) {
        runOk = true;
      } else {
        runErrorMsg = await runRes.text();
      }
    } catch (err: any) {
      runErrorMsg = err.message || "Network error running delete script";
    }

    // 4. Delete the script from the router
    try {
      const removeRes = await fetch(`${baseUrl}/rest/system/script/remove`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ".id": scriptId
        })
      });
      if (!removeRes.ok) {
        console.warn(`Failed to remove temporary delete script ${scriptName} (${removeRes.status})`);
      }
    } catch (e) {
      console.warn(`Failed to remove delete script ${scriptName}`, e);
    }

    // 5. Verify script execution succeeded
    if (!runOk) {
      throw new Error(`Failed to execute delete script on router: ${runErrorMsg.substring(0, 100)}`);
    }
  }
};

export const fetchHotspotServerAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch hotspot servers (${res.status}): ${txt.substring(0, 100)}`);
  }
  const data = await res.json();
  return data as Array<{ '.id': string; name: string; disabled: string;[key: string]: any }>;
};

export const toggleHotspotServerAPI = async (id: string, disabled: boolean) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/set`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ '.id': id, disabled: disabled ? 'yes' : 'no' }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to toggle hotspot server (${res.status}): ${txt.substring(0, 100)}`);
  }
};

export const fetchInterfacesAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/interface`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch interfaces (${res.status}): ${txt.substring(0, 100)}`);
  }
  const data = await res.json();
  return data as Array<{ name: string; type: string;[key: string]: any }>;
};

export const fetchHotspotServerProfilesAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/profile`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch server profiles (${res.status}): ${txt.substring(0, 100)}`);
  }
  const data = await res.json();
  return data.map((p: any) => p.name) as string[];
};

export const createHotspotServerProfileAPI = async (name: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/profile/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: name,
      "hotspot-address": "0.0.0.0",
      "html-directory": "hotspot"
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create server profile (${res.status}): ${txt.substring(0, 100)}`);
  }
};

export const createHotspotServerAPI = async (name: string, iface: string, serverProfile: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: name,
      interface: iface,
      "address-pool": "none",
      "profile": serverProfile
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create hotspot server (${res.status}): ${txt.substring(0, 100)}`);
  }
};

export const fetchSystemResourcesAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/system/resource`, { headers });
  if (!res.ok) {
    throw new Error("Failed to fetch system resources");
  }
  return await res.json();
};

export const fetchSystemHealthAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`${baseUrl}/rest/system/health`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
};

export const checkConnectionAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`${baseUrl}/rest/system/resource`, { headers });
    return res.ok;
  } catch (e) {
    return false;
  }
};

export const fetchActiveSessionsAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/active`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch active sessions (${res.status}): ${txt.substring(0, 100)}`);
  }
  return await res.json();
};

export const removeActiveSessionAPI = async (id: string) => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/active/remove`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ".id": id })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to kick user (${res.status}): ${txt.substring(0, 100)}`);
  }
};

export const fetchHostsAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/ip/hotspot/host`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch hosts (${res.status}): ${txt.substring(0, 100)}`);
  }
  return await res.json();
};

export const fetchLeasesAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`${baseUrl}/rest/ip/dhcp-server/lease`, { headers });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
};

export const fetchSchedulersAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(`${baseUrl}/rest/system/scheduler`, { headers });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
};


export const formatUptimeAPI = (uptime: string): string => {
  if (!uptime || uptime === '0s' || uptime === '00:00:00' || uptime === 'Offline') return uptime === 'Offline' ? 'Offline' : '0m';

  // MikroTik formats: "1d02:03:04", "02:03:04", "05:10", "1w2d..."
  // We want to extract Days, Hours, Minutes and ignore Seconds.

  let totalMins = 0;

  // Weeks
  const weekMatch = uptime.match(/(\d+)w/);
  if (weekMatch) totalMins += parseInt(weekMatch[1]) * 7 * 24 * 60;

  // Days
  const dayMatch = uptime.match(/(\d+)d/);
  if (dayMatch) totalMins += parseInt(dayMatch[1]) * 24 * 60;

  // Time part (HH:MM:SS or MM:SS)
  const timePart = uptime.match(/(\d{1,2}:){1,2}\d{1,2}/);
  if (timePart) {
    const parts = timePart[0].split(':').map(p => parseInt(p));
    if (parts.length === 3) { // HH:MM:SS
      totalMins += parts[0] * 60 + parts[1];
    } else if (parts.length === 2) { // MM:SS
      totalMins += parts[0];
    }
  } else {
    // Check for "5m2s" style
    const minMatch = uptime.match(/(\d+)m/);
    if (minMatch) totalMins += parseInt(minMatch[1]);
    const hourMatch = uptime.match(/(\d+)h/);
    if (hourMatch) totalMins += parseInt(hourMatch[1]) * 60;
  }

  if (totalMins === 0) return '0m';

  const d = Math.floor(totalMins / (24 * 60));
  const h = Math.floor((totalMins % (24 * 60)) / 60);
  const m = totalMins % 60;

  let res = '';
  if (d > 0) res += `${d}d `;
  if (h > 0) res += `${h}h `;
  if (m > 0 || res === '') res += `${m}m`;

  return res.trim();
};

export const fetchSystemClockAPI = async () => {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${baseUrl}/rest/system/clock`, { headers });
  if (!res.ok) {
    throw new Error("Failed to fetch system clock");
  }
  return await res.json();
};
