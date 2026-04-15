import { API_BASE } from './backendUrl';

export { API_BASE as BASE_URL };

const TIMEOUT_MS = 8000;

// ID da sessão ativa (mantido enquanto o app estiver aberto)
let sessionId: string | null = null;

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { ...(options?.headers ?? {}) };
  return fetch(url, { ...options, headers, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId;

  const res = await fetchWithTimeout(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Sessão ${new Date().toLocaleString('pt-BR')}` }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao criar sessão: HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  // Suporta diferentes formatos de resposta: { id }, { sessionId }, { session_id }
  sessionId = data.id ?? data.sessionId ?? data.session_id;
  if (!sessionId) throw new Error('Resposta da sessão sem ID: ' + JSON.stringify(data));
  return sessionId;
}
/**
 * Representa um ponto do heatmap
 */
export type HeatPoint = {
  x: number;      // posição horizontal (0 a 1)
  y: number;      // posição vertical (0 a 1)
  count: number;  // quantidade de cliques agrupados
  weight: number; // peso relativo (0 a 1)
};

/**
 * Resposta da API de cliques
 */
export type ClicksResponse = {
  total: number;       // total de cliques brutos
  points: HeatPoint[]; // pontos já agrupados
};

/**
 * Agrupa pontos brutos {x, y} que estejam dentro do raio `radius` (coords normalizadas 0-1)
 * em clusters pelo centroide ponderado.
 */
function clusterPoints(raw: { x: number; y: number }[], radius = 0.05): HeatPoint[] {
  // Lista de clusters registrados
  const clusters: { x: number; y: number; count: number }[] = [];

  for (const p of raw) {
    let nearest: (typeof clusters)[0] | null = null;
    let minDist = Infinity;

    // Procura o cluster mais próximo do toque registrado por último
    for (const c of clusters) {
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = c;
      }
    }

// Caso exista um cluster próximo o suficiente, adiciona nele
    if (nearest && minDist < radius) {
      const total = nearest.count + 1;
      
      // Após adiconar o toque ao cluster, é recalculado o centro do cluster
      nearest.x = (nearest.x * nearest.count + p.x) / total;
      nearest.y = (nearest.y * nearest.count + p.y) / total;
      nearest.count = total;
      
  // Caso contrário cria um novo cluster
    } else {
      clusters.push({ x: p.x, y: p.y, count: 1 });
    }
  }

  // Encontra o maior cluster para normalizar os pesos
  const maxCount = Math.max(...clusters.map((c) => c.count), 1);

  // Retorna os clusters com peso relativo
  return clusters.map((c) => ({
    x: c.x,
    y: c.y,
    count: c.count,
    weight: Math.max(0.1, c.count / maxCount),
  }));
}

/**
 * Inicializa a sessão
 */
export async function initSession(): Promise<void> {
  await ensureSession();
}

/**
 * Envia um clique para o backend
 */
export async function sendClick(x: number, y: number): Promise<void> {
  const sid = await ensureSession();
  await fetchWithTimeout(`${API_BASE}/sessions/${sid}/clicks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

/**
 * Busca os cliques do backend e retorna já agrupados
 */
export async function getClicks(): Promise<ClicksResponse> {
  const sid = await ensureSession();
  const res = await fetchWithTimeout(`${API_BASE}/sessions/${sid}/clicks`);
  const text = await res.text();

   // Verifica erro HTTP
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  let raw: unknown;
  
  // Tenta converter resposta para JSON
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida (não é JSON):\n${text.slice(0, 300)}`);
  }

  // Normaliza diferentes formatos: { clicks: [...] } ou { points: [...] } ou array direto
  let items: { x: number; y: number }[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const list = obj.clicks ?? obj.points ?? obj.data ?? [];
    items = Array.isArray(list) ? (list as { x: number; y: number }[]) : [];
  }

  // Agrupa os pontos (heatmap)
  const points = clusterPoints(items);
  return { total: items.length, points };
}

/**
 * Remove todos os cliques da sessão atual
 * e força a criação de uma nova sessão
 */
export async function resetClicks(): Promise<void> {
  const sid = await ensureSession();
  await fetchWithTimeout(`${API_BASE}/sessions/${sid}/clicks`, { method: 'DELETE' });
  // Reseta a sessão para criar uma nova no próximo uso
  sessionId = null;
}
