/**
 * WireGuard provisioning and management endpoints.
 *
 * GET  /api/server/public-key             — VPS WireGuard public key
 * GET  /api/routers/next-subnet           — Next available subnet index
 * POST /api/routers/:id/wireguard/setup   — Full WireGuard tunnel provisioning
 */
const express = require('express');
const router = express.Router();
const { firestoreDb } = require('../lib/firebase');
const { getServerKeys, getTunnelName, buildServerConfig, activateTunnel, ensureKeys } = require('../lib/wireguard');
const { findRouter, upsertRouter, getAllRouters, fetchRouterFromFirestore } = require('../lib/routerDatabase');

// Return the VPS WireGuard public key
router.get('/server/public-key', (req, res) => {
    try {
        const { publicKey } = getServerKeys();
        res.json({ publicKey });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Return the next available subnet index
router.get('/routers/next-subnet', (req, res) => {
    const routerDatabase = getAllRouters();
    let subnetIdx = 1;
    const usedSubnets = routerDatabase
        .map(r => {
            const match = (r.vpnIp || '').match(/^10\.8\.(\d+)\./);
            return match ? parseInt(match[1]) : null;
        })
        .filter(n => n !== null);

    while (usedSubnets.includes(subnetIdx)) {
        subnetIdx++;
    }

    res.json({ subnetIdx });
});

// Generate a RouterOS script for manual WireGuard provisioning
router.post('/routers/generate-script', async (req, res) => {
    try {
        const { id, name, model, wifiName, user, pass, vpsPublicIp } = req.body;
        if (!id || !vpsPublicIp) {
            return res.status(400).json({ error: 'id and vpsPublicIp are required' });
        }

        const routerDatabase = getAllRouters();
        let subnetIdx = 1;
        const usedSubnets = routerDatabase
            .map(r => {
                const match = (r.vpnIp || '').match(/^10\.8\.(\d+)\./);
                return match ? parseInt(match[1]) : null;
            })
            .filter(n => n !== null);

        while (usedSubnets.includes(subnetIdx)) {
            subnetIdx++;
        }

        const routerVpnIp = `10.8.${subnetIdx}.1`;
        const serverVpnIp = `10.8.${subnetIdx}.2`;
        const vpsListenPort = 13000 + subnetIdx;

        // Generate keypair for MikroTik
        const mkPrivateKey = require('child_process').execSync('wg genkey').toString().trim();
        const mkPublicKey = require('child_process').execSync(`echo "${mkPrivateKey}" | wg pubkey`).toString().trim();

        const { publicKey: serverPublicKey } = getServerKeys();

        // Create the RouterOS script
        const script = `/interface wireguard add name=wg-api listen-port=13231 private-key="${mkPrivateKey}"
/interface wireguard peers add interface=wg-api public-key="${serverPublicKey}" allowed-address=${serverVpnIp}/32 endpoint-address=${vpsPublicIp} endpoint-port=${vpsListenPort} persistent-keepalive=25s comment="Node.js Server Peer"
/ip address add address=${routerVpnIp}/24 interface=wg-api
/ip firewall filter add action=accept chain=input in-interface=wg-api place-before=1 comment="Allow wg-api"
/ip service set api-ssl disabled=yes
/ip service set api disabled=no
/ip service set winbox disabled=no`;

        // Save to Firestore as a managed router
        const routerData = {
            id,
            name: name || 'New Router',
            model: model || 'other',
            wifiName: wifiName || '',
            user: user || 'admin',
            pass: pass || '',
            ip: routerVpnIp,
            host: routerVpnIp,
            vpnIp: routerVpnIp,
            wgClientIp: `${serverVpnIp}/24`,
            wgServerPublicKey: mkPublicKey,
            wgServerListenPort: vpsListenPort,
            isCloudManaged: true,
            registeredAt: new Date().toISOString()
        };

        upsertRouter(routerData);
        if (firestoreDb) {
            await firestoreDb.collection('routers').doc(id).set(routerData, { merge: true });
        }

        res.json({
            success: true,
            script,
            router: routerData
        });
    } catch (err) {
        console.error(`[WG-SCRIPT] Failed to generate script:`, err);
        res.status(500).json({ error: err.message || 'Script generation failed' });
    }
});

// Full WireGuard tunnel provisioning
router.post('/routers/:id/wireguard/setup', async (req, res) => {
    const { privateKey: serverPrivateKey, publicKey: serverPublicKey } = getServerKeys();

    // Accept config from request body to handle race conditions
    if (req.body && req.body.id === req.params.id) {
        upsertRouter(req.body);
        console.log(`[WG-SETUP] Loaded/Updated router "${req.body.name}" from request body.`);
    }

    let routerConfig = findRouter(req.params.id);
    if (!routerConfig) {
        routerConfig = await fetchRouterFromFirestore(req.params.id);
    }

    if (!routerConfig) {
        return res.status(404).json({ error: 'Router configuration not found in server database.' });
    }

    // ── Path A: App-provisioned router (already has WG keys configured on router) ──
    if (routerConfig.wgServerPublicKey) {
        try {
            const ifaceName = getTunnelName(routerConfig);
            const confContent = buildServerConfig(routerConfig);
            activateTunnel(ifaceName, confContent);

            if (firestoreDb) {
                await firestoreDb.collection('routers').doc(routerConfig.id).update({
                    isCloudManaged: true
                });
                console.log(`[Firestore] Router ${routerConfig.id} updated: isCloudManaged = true`);
            }

            routerConfig.host = routerConfig.vpnIp || '10.88.0.1';
            routerConfig.isCloudManaged = true;

            return res.json({
                success: true,
                message: 'Dynamic WireGuard tunnel configured and active',
                routerVpnIp: routerConfig.vpnIp || '10.88.0.1',
                serverVpnIp: routerConfig.wgClientIp || '10.88.0.2/24'
            });
        } catch (err) {
            console.error(`[WG-SETUP] Dynamic WireGuard setup failed:`, err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Dynamic WireGuard setup failed'
            });
        }
    }

    // ── Path B: Server-initiated setup (connects to router via RouterOS API) ──
    const routerDatabase = getAllRouters();
    let subnetIdx = 1;
    const usedSubnets = routerDatabase
        .map(r => {
            const match = (r.vpnIp || '').match(/^10\.8\.(\d+)\./);
            return match ? parseInt(match[1]) : null;
        })
        .filter(n => n !== null);

    while (usedSubnets.includes(subnetIdx)) {
        subnetIdx++;
    }

    const routerVpnIp = `10.8.${subnetIdx}.1`;
    const serverVpnIp = `10.8.${subnetIdx}.2`;
    const ifaceName = getTunnelName(routerConfig);

    const auth = 'Basic ' + Buffer.from(`${routerConfig.user}:${routerConfig.password}`).toString('base64');
    const baseUrl = `http://${routerConfig._rawIp || routerConfig.host}/rest`;

    const apiCall = async (method, path, body = null) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const opts = {
            method,
            headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            signal: controller.signal
        };
        if (body) opts.body = JSON.stringify(body);
        
        try {
            const res = await fetch(`${baseUrl}${path}`, opts);
            clearTimeout(timeoutId);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`API error ${res.status}: ${text}`);
            }
            // For DELETE or empty responses
            const text = await res.text();
            if (!text) return [];
            const data = JSON.parse(text);
            return Array.isArray(data) ? data : (data ? [data] : []);
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    };

    try {
        console.log(`[WG-SETUP] Connecting to Router ${routerConfig.id} at ${routerConfig.host} via REST API...`);

        // Check/create WireGuard interface
        const allInterfaces = await apiCall('GET', '/interface/wireguard');
        const wgInterface = allInterfaces.find(i => i.name === 'wg-api');
        let routerPublicKey = '';

        if (!wgInterface) {
            console.log(`[WG-SETUP] Creating wg-api interface on router...`);
            await apiCall('PUT', '/interface/wireguard', {
                name: 'wg-api',
                'listen-port': '13232',
                comment: 'Provisioned by Node.js Server'
            });
            const newInterfaces = await apiCall('GET', '/interface/wireguard');
            const newWgInterface = newInterfaces.find(i => i.name === 'wg-api');
            if (newWgInterface) {
                routerPublicKey = newWgInterface['public-key'];
            }
        } else {
            console.log(`[WG-SETUP] wg-api interface exists. Reconfiguring...`);
            await apiCall('PATCH', `/interface/wireguard/${wgInterface['.id']}`, {
                'listen-port': '13232',
                disabled: 'false'
            });
            const updatedInterfaces = await apiCall('GET', '/interface/wireguard');
            const updatedWgInterface = updatedInterfaces.find(i => i.name === 'wg-api');
            routerPublicKey = updatedWgInterface['public-key'];
            console.log(`[WG-SETUP] wg-api configured. Router Public Key: ${routerPublicKey}`);
        }

        if (!routerPublicKey) {
            throw new Error('Could not retrieve Router WireGuard Public Key');
        }

        // Assign IP address
        const allAddresses = await apiCall('GET', '/ip/address');
        const addressExists = allAddresses.some(a => a.interface === 'wg-api');
        if (!addressExists) {
            console.log(`[WG-SETUP] Assigning IP ${routerVpnIp}/24 to wg-api...`);
            await apiCall('PUT', '/ip/address', {
                address: `${routerVpnIp}/24`,
                interface: 'wg-api'
            });
        } else {
            const wgAddress = allAddresses.find(a => a.interface === 'wg-api');
            console.log(`[WG-SETUP] Reconfiguring IP for wg-api to ${routerVpnIp}/24...`);
            await apiCall('PATCH', `/ip/address/${wgAddress['.id']}`, {
                address: `${routerVpnIp}/24`
            });
        }

        // Register server peer on router
        const allPeers = await apiCall('GET', '/interface/wireguard/peers');
        const peerExists = allPeers.some(p => p['public-key'] === serverPublicKey);
        if (!peerExists) {
            console.log(`[WG-SETUP] Registering Node.js server as peer on router...`);
            await apiCall('PUT', '/interface/wireguard/peers', {
                interface: 'wg-api',
                'public-key': serverPublicKey,
                'allowed-address': `${serverVpnIp}/32`,
                'persistent-keepalive': '25s',
                comment: 'Node.js Server Peer'
            });
        } else {
            const peer = allPeers.find(p => p['public-key'] === serverPublicKey);
            console.log(`[WG-SETUP] Reconfiguring peer settings on router...`);
            await apiCall('PATCH', `/interface/wireguard/peers/${peer['.id']}`, {
                'allowed-address': `${serverVpnIp}/32`
            });
        }

        // Create and activate local WireGuard tunnel
        const wgConfContent = `[Interface]
PrivateKey = ${serverPrivateKey}
Address = ${serverVpnIp}/24

[Peer]
PublicKey = ${routerPublicKey}
Endpoint = ${routerConfig.host}:13232
AllowedIPs = ${routerVpnIp}/32
PersistentKeepalive = 25
`;
        activateTunnel(ifaceName, wgConfContent);

        // Update in-memory state and Firestore
        const oldHost = routerConfig.host;
        Object.assign(routerConfig, {
            host: routerVpnIp,
            vpnIp: routerVpnIp,
            wgClientPrivateKey: serverPrivateKey,
            wgServerPublicKey: routerPublicKey,
            wgEndpointHost: oldHost,
            wgEndpointPort: 13232,
            wgClientIp: `${serverVpnIp}/24`,
            isCloudManaged: true,
            wgConfigName: ifaceName
        });

        if (firestoreDb) {
            await firestoreDb.collection('routers').doc(routerConfig.id).update({
                vpnIp: routerVpnIp,
                wgServerPublicKey: routerPublicKey,
                wgEndpointHost: oldHost,
                wgEndpointPort: 13232,
                wgClientIp: `${serverVpnIp}/24`,
                wgClientPrivateKey: serverPrivateKey,
                isCloudManaged: true,
                wgConfigName: ifaceName
            });
            console.log(`[Firestore] Router ${routerConfig.id} updated with WireGuard subnet 10.8.${subnetIdx}.X`);
        }

        res.json({
            success: true,
            message: 'WireGuard tunnel provisioned, active, and saved to Firestore successfully',
            routerPublicKey,
            serverPublicKey,
            vpnSubnet: `10.8.${subnetIdx}.0/24`,
            routerVpnIp,
            serverVpnIp
        });

    } catch (err) {
        console.error(`[WG-SETUP] Failed to provision WireGuard:`, err);
        res.status(500).json({
            success: false,
            error: err.message || 'WireGuard setup failed'
        });
    }
});

module.exports = router;
