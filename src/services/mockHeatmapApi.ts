export type TapRecord = {
  x: number;
  y: number;
  isHit: boolean;
  targetIndex: number;
  pressedIndex: number;
  roundAt: number;
};

export type TapPoint = TapRecord & {
  id: string;
  weight: number;
};

type TapSummary = {
  total: number;
  points: TapPoint[];
  hottestZoneLabel: string;
};

const taps: TapRecord[] = [];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildZoneLabel(x: number, y: number) {
  const horizontal = x < 0.33 ? 'Esquerda' : x < 0.66 ? 'Centro' : 'Direita';
  const vertical = y < 0.33 ? 'superior' : y < 0.66 ? 'central' : 'inferior';
  return `${horizontal} ${vertical}`;
}

export function recordTap(record: TapRecord) {
  taps.push(record);
}

export function clearTapSession() {
  taps.length = 0;
}

export function getTapSummary(): TapSummary {
  if (taps.length === 0) {
    return {
      total: 0,
      points: [],
      hottestZoneLabel: 'Nenhuma',
    };
  }

  const density = new Map<string, number>();

  taps.forEach((tap) => {
    const bucketX = Math.floor(tap.x * 8);
    const bucketY = Math.floor(tap.y * 10);
    const key = `${bucketX}:${bucketY}`;
    density.set(key, (density.get(key) ?? 0) + 1);
  });

  const maxDensity = Math.max(...density.values(), 1);
  let hottest = taps[0];
  let hottestDensity = 0;

  const points = taps.map((tap, index) => {
    const bucketX = Math.floor(tap.x * 8);
    const bucketY = Math.floor(tap.y * 10);
    const bucketKey = `${bucketX}:${bucketY}`;
    const currentDensity = density.get(bucketKey) ?? 1;

    if (currentDensity > hottestDensity) {
      hottestDensity = currentDensity;
      hottest = tap;
    }

    return {
      ...tap,
      id: `${tap.roundAt}-${index}`,
      weight: clamp(currentDensity / maxDensity, 0.16, 1),
    };
  });

  return {
    total: taps.length,
    points,
    hottestZoneLabel: buildZoneLabel(hottest.x, hottest.y),
  };
}
