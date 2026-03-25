import { BACKEND_URL } from './backendUrl';

export const BASE_URL = BACKEND_URL;

const TIMEOUT_MS = 8000;

// Header necessário para o localtunnel não retornar página de aviso HTML
const TUNNEL_HEADERS: Record<string, string> = {
  'bypass-tunnel-reminder': 'true',
};

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { ...TUNNEL_HEADERS, ...(options?.headers ?? {}) };
  return fetch(url, { ...options, headers, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

export type HeatPoint = {
  x: number;
  y: number;
  count: number;
  weight: number;
};

export type ClicksResponse = {
  total: number;
  points: HeatPoint[];
};

/**
 * Agrupa pontos brutos {x, y} que estejam dentro do raio `radius` (em coords normalizadas 0-1)
 * em clusters pelo centroide ponderado. Pontos mais próximos viram um "calor" só.
 */
function clusterPoints(raw: { x: number; y: number }[], radius = 0.05): HeatPoint[] {
  const clusters: { x: number; y: number; count: number }[] = [];

  for (const p of raw) {
    let nearest: (typeof clusters)[0] | null = null;
    let minDist = Infinity;

    for (const c of clusters) {
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = c;
      }
    }

    if (nearest && minDist < radius) {
      // Incorpora o ponto no cluster pelo centroide ponderado
      const total = nearest.count + 1;
      nearest.x = (nearest.x * nearest.count + p.x) / total;
      nearest.y = (nearest.y * nearest.count + p.y) / total;
      nearest.count = total;
    } else {
      clusters.push({ x: p.x, y: p.y, count: 1 });
    }
  }

  const maxCount = Math.max(...clusters.map((c) => c.count), 1);
  return clusters.map((c) => ({
    x: c.x,
    y: c.y,
    count: c.count,
    weight: Math.max(0.1, c.count / maxCount),
  }));
}

export async function sendClick(x: number, y: number): Promise<void> {
  await fetchWithTimeout(`${BASE_URL}/api/clicks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

export async function getClicks(): Promise<ClicksResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/clicks`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let raw: { total: number; points: { x: number; y: number }[] };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida (não é JSON):\n${text.slice(0, 300)}`);
  }

  return {
    total: raw.total,
    points: clusterPoints(raw.points),
  };
}

export async function resetClicks(): Promise<void> {
  await fetchWithTimeout(`${BASE_URL}/api/clicks`, { method: 'DELETE' });
}
