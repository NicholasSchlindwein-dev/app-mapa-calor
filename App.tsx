import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { BASE_URL, getClicks, HeatPoint, initSession, resetClicks, sendClick } from './src/services/heatmapApi';

function heatColor(weight: number): string {
  if (weight < 0.25) return `rgba(59, 130, 246, ${0.4 + weight * 0.8})`;
  if (weight < 0.5) return `rgba(34, 197, 94, ${0.5 + weight * 0.6})`;
  if (weight < 0.75) return `rgba(234, 179, 8, ${0.6 + weight * 0.5})`;
  return `rgba(239, 68, 68, ${0.65 + weight * 0.35})`;
}

function heatRadius(weight: number, screenW: number): number {
  const minR = screenW * 0.04;
  const maxR = screenW * 0.14;
  return minR + weight * (maxR - minR);
}

export default function App() {
  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden');
    NavigationBar.setBehaviorAsync('overlay-swipe');
    // Cria a sessão antecipadamente para não atrasar o primeiro clique
    initSession().catch(() => {});
  }, []);

  // Dimensões reais da área clicável, medidas após o layout renderizar.
  // Usamos useRef para que handleScreenPress sempre leia o valor mais recente
  // sem precisar ser recriado a cada resize.
  const areaSizeRef = useRef({ width: 0, height: 0 });
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });

  const handleAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    areaSizeRef.current = { width, height };
    setAreaSize({ width, height });
  }, []);

  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const handleScreenPress = useCallback((e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    const { width, height } = areaSizeRef.current;
    if (width === 0 || height === 0) return;
    sendClick(pageX / width, pageY / height).catch(() => {});
  }, []);

  const openHeatmap = useCallback(async () => {
    setHeatmapError(null);
    setLoadingHeatmap(true);
    setHeatmapVisible(true);
    try {
      const data = await getClicks();
      setPoints(data.points);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setHeatmapError(`${msg}\n\nURL: ${BASE_URL}`);
    } finally {
      setLoadingHeatmap(false);
    }
  }, []);

  const handleReset = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await resetClicks();
      setPoints([]);
    } finally {
      setResetting(false);
    }
  }, [resetting]);

  const closeHeatmap = useCallback(() => {
    setHeatmapVisible(false);
  }, []);

  const { width: w, height: h } = areaSize;

  return (
    <View style={styles.root}>
      <StatusBar hidden translucent backgroundColor="transparent" />

      {/* Área de captura de cliques — onLayout mede as dimensões reais renderizadas */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onLayout={handleAreaLayout}
        onPress={handleScreenPress}
      />

      {/* Barra de botões no topo */}
      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
          onPress={openHeatmap}
        >
          <Text style={styles.btnPrimaryText}>Ver Mapa de Calor</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.btnPressed]}
          onPress={handleReset}
        >
          {resetting ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Text style={styles.btnSecondaryText}>Resetar</Text>
          )}
        </Pressable>
      </View>

      {/* Modal fullscreen do heatmap — usa as mesmas dimensões da área clicável */}
      <Modal
        visible={heatmapVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeHeatmap}
      >
        <View style={[styles.heatmapScreen, { width: w, height: h }]}>
          {loadingHeatmap ? (
            <ActivityIndicator size="large" color="#3b82f6" />
          ) : heatmapError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Erro ao carregar</Text>
              <Text style={styles.errorMsg}>{heatmapError}</Text>
            </View>
          ) : (
            points.map((pt, i) => {
              const r = heatRadius(pt.weight, w);
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.heatDot,
                    {
                      left: pt.x * w - r,
                      top: pt.y * h - r,
                      width: r * 2,
                      height: r * 2,
                      borderRadius: r,
                      backgroundColor: heatColor(pt.weight),
                    },
                  ]}
                />
              );
            })
          )}

          {/* Botão fechar */}
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            onPress={closeHeatmap}
          >
            <Text style={styles.closeBtnText}>Fechar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  btnPrimary: {
    backgroundColor: '#3b82f6',
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  btnSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    minWidth: 80,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
  btnPressed: {
    opacity: 0.7,
  },
  heatmapScreen: {
    backgroundColor: '#f8fafc',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heatDot: {
    position: 'absolute',
  },
  closeBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 12,
  },
  closeBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  errorBox: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ef4444',
  },
  errorMsg: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
});
