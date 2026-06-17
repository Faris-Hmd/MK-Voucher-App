/**
 * WireGuard key management and tunnel helpers.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const PRIVATE_KEY_PATH = path.join(ROOT_DIR, 'wg_private.key');
const PUBLIC_KEY_PATH = path.join(ROOT_DIR, 'wg_public.key');

/** Generate WireGuard keypair if not already present on disk. */
function ensureKeys() {
    if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
        console.log('🗝️ Generating new WireGuard keys...');
        try {
            const privateKey = execSync('wg genkey').toString().trim();
            const publicKey = execSync(`echo "${privateKey}" | wg pubkey`).toString().trim();
            fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
            fs.chmodSync(PRIVATE_KEY_PATH, 0o600);
            fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);
            console.log('🗝️ WireGuard keys generated successfully.');
        } catch (error) {
            console.error('❌ Failed to generate WireGuard keys.', error);
        }
    }
}

/** Read server private and public keys from disk. */
function getServerKeys() {
    ensureKeys();
    return {
        privateKey: fs.readFileSync(PRIVATE_KEY_PATH, 'utf8').trim(),
        publicKey: fs.readFileSync(PUBLIC_KEY_PATH, 'utf8').trim()
    };
}

/** Get a valid Linux interface name (max 15 characters). */
function getTunnelName(router) {
    if (router.wgConfigName && router.wgConfigName.length <= 15) {
        return router.wgConfigName;
    }
    const base = (router.id || router.name || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    return `wg-${base.slice(-12)}`;
}

/** Write a WireGuard config, copy to /etc/wireguard, and bring the tunnel up. */
function activateTunnel(ifaceName, confContent) {
    const isRoot = process.getuid && process.getuid() === 0;
    const prefix = isRoot ? '' : 'sudo ';
    const localConfPath = path.join(ROOT_DIR, `${ifaceName}.conf`);
    const destPath = `/etc/wireguard/${ifaceName}.conf`;

    fs.writeFileSync(localConfPath, confContent);
    fs.chmodSync(localConfPath, 0o600);

    console.log(`🌐 [TUNNEL-${ifaceName}] Copying config to ${destPath}...`);
    execSync(`${prefix}cp "${localConfPath}" "${destPath}"`);
    execSync(`${prefix}chmod 600 "${destPath}"`);

    console.log(`🌐 [TUNNEL-${ifaceName}] Tearing down any existing interface...`);
    execSync(`${prefix}wg-quick down ${ifaceName} 2>/dev/null || true`);

    console.log(`🌐 [TUNNEL-${ifaceName}] Starting WireGuard tunnel...`);
    execSync(`${prefix}wg-quick up ${ifaceName}`);
    console.log(`🌐 [TUNNEL-${ifaceName}] WireGuard tunnel active.`);

    try { fs.unlinkSync(localConfPath); } catch (_) {}
}

/** Tear down a WireGuard tunnel and remove its config file. */
function teardownTunnel(ifaceName) {
    const isRoot = process.getuid && process.getuid() === 0;
    const prefix = isRoot ? '' : 'sudo ';
    const destPath = `/etc/wireguard/${ifaceName}.conf`;
    execSync(`${prefix}wg-quick down ${ifaceName} 2>/dev/null || true`);
    if (fs.existsSync(destPath)) {
        execSync(`${prefix}rm -f "${destPath}"`);
    }
}

/** Build a WireGuard config string for the VPS side of a tunnel. */
function buildServerConfig(router) {
    const { privateKey: globalPrivateKey } = getServerKeys();
    const usePrivateKey = router.wgClientPrivateKey || globalPrivateKey;
    let conf = `[Interface]
PrivateKey = ${usePrivateKey}
Address = ${router.wgClientIp || '10.88.0.2/24'}
`;
    if (router.wgServerListenPort) {
        conf += `ListenPort = ${router.wgServerListenPort}\n`;
    }

    conf += `
[Peer]
PublicKey = ${router.wgServerPublicKey}
AllowedIPs = ${router.vpnIp}/32
PersistentKeepalive = 25
`;
    if (router.wgEndpointHost) {
        conf += `Endpoint = ${router.wgEndpointHost}:${router.wgEndpointPort || '13231'}\n`;
    }
    return conf;
}

/** Establish WireGuard tunnels for an array of routers. */
function ensureRemoteTunnels(routers) {
    routers.forEach(router => {
        if (!router.wgServerPublicKey || !router.vpnIp) return;

        const tunnelName = getTunnelName(router);
        console.log(`🌐 [TUNNEL-${tunnelName}] Generating remote configuration from Firestore...`);

        try {
            const confContent = buildServerConfig(router);
            activateTunnel(tunnelName, confContent);
        } catch (error) {
            console.error(`❌ [TUNNEL-${tunnelName}] Failed to establish tunnel:`, error.message);
        }
    });
}

module.exports = {
    ensureKeys,
    getServerKeys,
    getTunnelName,
    activateTunnel,
    teardownTunnel,
    buildServerConfig,
    ensureRemoteTunnels
};
