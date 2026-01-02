const { exec } = require('child_process');

async function runQuery(query) {
    return new Promise((resolve) => {
        exec(`powershell -Command "${query}"`, (error, stdout, stderr) => {
            if (error) {
                resolve('');
            } else {
                resolve(stdout);
            }
        });
    });
}

async function main() {
    console.log('🔍 Mapping all COM ports to hardware names...\n');

    // Get all COM ports that the system sees
    const portsStr = await runQuery('[System.IO.Ports.SerialPort]::GetPortNames()');
    const ports = portsStr.split(/\r?\n/).filter(p => p.trim());

    console.log(`Active COM ports found: ${ports.join(', ')}\n`);

    // Get PnP mapping
    // We use a broader query and parse it in JS to avoid PS quoting issues
    const pnpStr = await runQuery('Get-PnpDevice | Select-Object FriendlyName, InstanceId, Status | ConvertTo-Json');
    try {
        const pnpDevices = JSON.parse(pnpStr);

        for (const port of ports) {
            const match = pnpDevices.find(d => d.FriendlyName && d.FriendlyName.includes(`(${port})`));
            if (match) {
                console.log(`📍 ${port} -> ${match.FriendlyName} [${match.Status}]`);
            } else {
                // Secondary check for modems
                console.log(`❓ ${port} -> No direct PnP mapping found (possibly a hidden or virtual device)`);
            }
        }
    } catch (e) {
        console.log('❌ Error parsing PnP data. Falling back to simple listing.');
        console.log(pnpStr);
    }

    console.log('\n🔍 Full Huawei Device List:');
    const huaweiStr = await runQuery('Get-PnpDevice | Where-Object { $_.FriendlyName -like "*Huawei*" } | Select-Object FriendlyName, Status | Format-Table -AutoSize');
    console.log(huaweiStr);
}

main().catch(console.error);
