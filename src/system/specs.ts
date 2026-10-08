import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemSpecs {
    cpuModel: string;
    cpuCores: number;
    cpuSpeed: number;
    ramGB: number;
    hasGpu: boolean;
    gpuName: string;
    osInfo: string;
    ramFreeGB: number;
    ramUsedPercent: number;
    cpuTempC: number | null;
    cpuLoadPercent: number | null;
}

export interface LiveStats {
    ramGB: number;
    ramFreeGB: number;
    ramUsedPercent: number;
    cpuTempC: number | null;
    cpuLoadPercent: number | null;
}

export interface RecommendedModel {
    name: string;
    desc: string;
    tag: string;
}

function getRamStats(): { ramGB: number; ramFreeGB: number; ramUsedPercent: number } {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    return {
        ramGB: Math.round(totalBytes / 1024 ** 3),
        ramFreeGB: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
        ramUsedPercent: Math.round(((totalBytes - freeBytes) / totalBytes) * 100)
    };
}

/**
 * Best-effort CPU-Temperatur. Nur Linux hat dafür einen dependency-freien Weg
 * (Thermal-Zones im sysfs); Windows/macOS brauchen Zusatz-Tools, daher null.
 */
async function getCpuTempC(): Promise<number | null> {
    if (process.platform !== 'linux') { return null; }

    try {
        const thermalRoot = '/sys/class/thermal';
        if (!fs.existsSync(thermalRoot)) { return null; }

        const zones = fs.readdirSync(thermalRoot).filter(z => z.startsWith('thermal_zone'));
        const readZone = (zone: string): number | null => {
            const tempPath = path.join(thermalRoot, zone, 'temp');
            if (!fs.existsSync(tempPath)) { return null; }
            const raw = parseInt(fs.readFileSync(tempPath, 'utf8').trim(), 10);
            return Number.isNaN(raw) ? null : Math.round(raw / 1000);
        };

        for (const zone of zones) {
            const typePath = path.join(thermalRoot, zone, 'type');
            const type = fs.existsSync(typePath)
                ? fs.readFileSync(typePath, 'utf8').trim().toLowerCase()
                : '';
            if (type.includes('x86_pkg') || type.includes('cpu') || type.includes('core')) {
                const value = readZone(zone);
                if (value !== null) { return value; }
            }
        }

        // Keine eindeutig benannte CPU-Zone: erste Zone als Näherung.
        for (const zone of zones) {
            const value = readZone(zone);
            if (value !== null) { return value; }
        }
    } catch (error) {
        console.error('Fehler beim Auslesen der CPU-Temperatur:', error);
    }

    return null;
}

/** os.loadavg() liefert auf Windows immer [0,0,0] — dort also null statt Falschangabe. */
function getCpuLoadPercent(cores: number): number | null {
    if (process.platform === 'win32' || !cores) { return null; }
    return Math.min(100, Math.round((os.loadavg()[0] / cores) * 100));
}

export async function getLiveStats(): Promise<LiveStats> {
    return {
        ...getRamStats(),
        cpuTempC: await getCpuTempC(),
        cpuLoadPercent: getCpuLoadPercent(os.cpus().length)
    };
}

async function detectGpu(): Promise<{ hasGpu: boolean; gpuName: string }> {
    const fallback = { hasGpu: false, gpuName: 'Integrierte GPU, keine dedizierte GPU erkannt' };
    const dedicatedMarkers = ['nvidia', 'amd', 'radeon', 'geforce', 'rtx', 'arc '];

    try {
        if (process.platform === 'linux') {
            const { stdout } = await execAsync('lspci -nnk | grep -i vga -A3', { timeout: 5000 });
            const lower = stdout.toLowerCase();
            if (dedicatedMarkers.some(marker => lower.includes(marker))) {
                return { hasGpu: true, gpuName: stdout.split('\n')[0] || fallback.gpuName };
            }
            return fallback;
        }

        if (process.platform === 'darwin') {
            const { stdout } = await execAsync('system_profiler SPDisplaysDataType', { timeout: 10_000 });
            const name = stdout.split('\n').map(l => l.trim())
                .find(l => l.startsWith('Chipset Model:'))?.replace('Chipset Model:', '').trim();
            if (name) {
                const lower = name.toLowerCase();
                return { hasGpu: dedicatedMarkers.some(m => lower.includes(m)), gpuName: name };
            }
            return fallback;
        }

        if (process.platform === 'win32') {
            const { stdout } = await execAsync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"',
                { timeout: 15_000 }
            );
            const name = stdout.split('\n').map(l => l.trim()).filter(Boolean)[0];
            if (name) {
                const lower = name.toLowerCase();
                return { hasGpu: dedicatedMarkers.some(m => lower.includes(m)), gpuName: name };
            }
            return fallback;
        }
    } catch (error) {
        console.error('Fehler beim Auslesen der GPU-Informationen:', error);
    }

    return fallback;
}

export async function getSystemSpecs(): Promise<SystemSpecs> {
    const cpus = os.cpus();
    const cpuCores = cpus.length;
    const { ramGB, ramFreeGB, ramUsedPercent } = getRamStats();
    const [gpu, cpuTempC] = await Promise.all([detectGpu(), getCpuTempC()]);

    return {
        cpuModel: cpus[0]?.model || 'Unbekannte CPU',
        cpuCores,
        cpuSpeed: cpus[0]?.speed ? cpus[0].speed / 1000 : 0,
        ramGB,
        hasGpu: gpu.hasGpu,
        gpuName: gpu.gpuName,
        osInfo: `${os.type()} ${os.release()} ${os.arch()}`,
        ramFreeGB,
        ramUsedPercent,
        cpuTempC,
        cpuLoadPercent: getCpuLoadPercent(cpuCores)
    };
}

export function getDynamicModelRecommendations(specs: SystemSpecs): RecommendedModel[] {
    const recommendations: RecommendedModel[] = [];

    if (!specs.hasGpu || specs.ramGB <= 16) {
        recommendations.push({
            name: 'qwen2.5-coder:1.5b',
            desc: `⚡ Sehr schnell für deine ${specs.cpuCores}-Kern CPU & ${specs.ramGB} GB RAM.`,
            tag: 'Optimal'
        });
        recommendations.push({
            name: 'deepseek-coder:1.3b',
            desc: '⚡ Leichtgewichtig für flüssige Autovervollständigung.',
            tag: 'Leicht'
        });
        if (specs.ramGB >= 16) {
            recommendations.push({
                name: 'qwen2.5-coder:7b',
                desc: `🧠 Höhere Präzision für deine ${specs.ramGB} GB RAM (auf CPU etwas langsamer).`,
                tag: 'Präzise'
            });
        }
    } else {
        recommendations.push({
            name: 'qwen2.5-coder:7b',
            desc: '🚀 Optimal für VRAM-beschleunigte Systeme.',
            tag: 'Empfohlen'
        });
        recommendations.push({
            name: 'deepseek-coder:6.7b',
            desc: '🧠 Ausgewogenes Modell für komplexe Logik.',
            tag: 'Präzise'
        });
    }

    return recommendations;
}
