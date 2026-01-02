const { exec } = require('child_process');

const queries = [
    'Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Name -like "*Huawei*" -or $_.Name -like "*HUAWEI*" } | Select-Object Name, Status, DeviceID',
    'Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Name -like "*Audio*" } | Select-Object Name, Status, DeviceID',
    'Get-WmiObject -Class Win32_SoundDevice | Select-Object Name, Status, DeviceID'
];

async function runQuery(query) {
    return new Promise((resolve) => {
        console.log(`\n🔍 Running: ${query}`);
        exec(`powershell -Command "${query} | Format-Table -AutoSize"`, (error, stdout, stderr) => {
            if (error) {
                console.log(`❌ Error: ${error.message}`);
                resolve('');
            } else {
                console.log(stdout);
                resolve(stdout);
            }
        });
    });
}

async function main() {
    for (const q of queries) {
        await runQuery(q);
    }
}

main().catch(console.error);
