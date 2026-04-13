import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import { getClicks, HeatPoint, initSession, resetClicks, sendClick } from './src/services/heatmapApi';

function heatColor(weight: number, dark: boolean): string {
  if (dark) {
    // Dark mode: mais brilhante e saturado para contrastar com fundo escuro
    if (weight < 0.15) return `rgba(167, 139, 250, ${0.55 + weight * 2.0})`;
    if (weight < 0.30) return `rgba(96, 165, 250, ${0.60 + weight * 1.6})`;
    if (weight < 0.45) return `rgba(34, 211, 238, ${0.65 + weight * 1.3})`;
    if (weight < 0.60) return `rgba(74, 222, 128, ${0.70 + weight * 1.0})`;
    if (weight < 0.72) return `rgba(250, 204, 21, ${0.75 + weight * 0.8})`;
    if (weight < 0.88) return `rgba(251, 146, 60, ${0.80 + weight * 0.5})`;
    return `rgba(248, 113, 113, ${0.85 + weight * 0.15})`;
  }
  // Light mode: gradiente original
  if (weight < 0.15) return `rgba(139, 92, 246, ${0.35 + weight * 1.5})`;
  if (weight < 0.30) return `rgba(59, 130, 246, ${0.45 + weight * 1.2})`;
  if (weight < 0.45) return `rgba(6, 182, 212, ${0.50 + weight * 1.0})`;
  if (weight < 0.60) return `rgba(34, 197, 94, ${0.55 + weight * 0.8})`;
  if (weight < 0.72) return `rgba(234, 179, 8, ${0.60 + weight * 0.6})`;
  if (weight < 0.88) return `rgba(249, 115, 22, ${0.65 + weight * 0.4})`;
  return `rgba(239, 68, 68, ${0.70 + weight * 0.30})`;
}

function heatRadius(screenW: number): number {
  // Tamanho fixo para todos os pontos — só a cor indica a intensidade
  return screenW * 0.062;
}

let _animId = 0;

type ClickAnim = {
  id: number;
  x: number;
  y: number;
  progress: Animated.Value;
  dark: boolean;
};

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const isDarkRef = useRef(false);

  // Carrega o tema salvo ao iniciar
  useEffect(() => {
    AsyncStorage.getItem('theme').then(val => {
      if (val === 'dark') { setIsDark(true); isDarkRef.current = true; }
    }).catch(() => {});
  }, []);
  const areaSizeRef = useRef({ width: 0, height: 0 });
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const [resetting, setResetting] = useState(false);
  const resettingRef = useRef(false);
  const screenLockedRef = useRef(false);
  const [clickAnims, setClickAnims] = useState<ClickAnim[]>([]);

  // Aviso inicial — some no primeiro clique
  const [showHint, setShowHint] = useState(true);
  const showHintRef = useRef(true);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const hintScale = useRef(new Animated.Value(1)).current;

  // Toast de reset
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastScale = useRef(new Animated.Value(0.85)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal de informações
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  // Pulso suave no hint de boas-vindas
  useEffect(() => {
    if (!showHint) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(hintScale, { toValue: 1.04, duration: 850, useNativeDriver: true }),
        Animated.timing(hintScale, { toValue: 1.00, duration: 850, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [showHint, hintScale]);

  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden');
    NavigationBar.setBehaviorAsync('overlay-swipe');
    NavigationBar.setPositionAsync('absolute');
    NavigationBar.setBackgroundColorAsync('#00000000');
    initSession().catch(() => {});
  }, []);

  const handleAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    areaSizeRef.current = { width, height };
    setAreaSize({ width, height });
  }, []);

  const handleScreenPress = useCallback(async (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    const { width, height } = areaSizeRef.current;
    if (width === 0 || height === 0) return;
    if (resettingRef.current || screenLockedRef.current) return;

    // Fecha o hint de boas-vindas no primeiro clique
    if (showHintRef.current) {
      showHintRef.current = false;
      setShowHint(false);
      Animated.timing(hintOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }

    // Animação de nova/brilho no ponto do clique
    const id = ++_animId;
    const progress = new Animated.Value(0);
    const dark = isDarkRef.current;

    setClickAnims(prev => [...prev.slice(-5), { id, x: pageX, y: pageY, progress, dark }]);

    Animated.timing(progress, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start(() => {
      setClickAnims(prev => prev.filter(a => a.id !== id));
    });

    // Envia clique e busca mapa atualizado instantaneamente
    try {
      await sendClick(pageX / width, pageY / height);
      const data = await getClicks();
      setPoints(data.points);
    } catch {}
  }, []);

  const showResetToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    screenLockedRef.current = true;
    toastOpacity.setValue(0);
    toastScale.setValue(0.85);

    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(toastScale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180 }),
    ]).start();

    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        screenLockedRef.current = false;
      });
    }, 5000);
  }, [toastOpacity, toastScale]);

  const handleReset = useCallback(async () => {
    if (resettingRef.current) return;
    resettingRef.current = true;
    setResetting(true);
    try {
      await resetClicks();
      setPoints([]);
      showResetToast();
    } finally {
      resettingRef.current = false;
      setResetting(false);
    }
  }, [showResetToast]);

  const { width: w, height: h } = areaSize;

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      <StatusBar hidden translucent backgroundColor="transparent" />

      {/* Área de captura de cliques */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onLayout={handleAreaLayout}
        onPress={handleScreenPress}
      />

      {/* Heatmap overlay — direto na tela, sem modal */}
      {w > 0 &&
        points.map((pt, i) => {
          const r = heatRadius(w);
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
                  backgroundColor: heatColor(pt.weight, isDark),
                },
              ]}
            />
          );
        })}

      {/* Animações de clique — efeito nova/brilho */}
      {clickAnims.map(({ id, x, y, progress, dark }) => {
        const primaryColor = dark ? '#22d3ee' : '#f59e0b';
        const secondaryColor = dark ? '#a78bfa' : '#fb923c';
        const coreColor = dark ? '#e0f2fe' : '#fffbeb';

        // Tamanho base dos anéis alinhado ao diâmetro fixo dos pontos do heatmap
        const dotR = w > 0 ? w * 0.062 : 25;
        const coreR = dotR * 0.55;   // núcleo menor que o ponto
        const ring1R = dotR * 0.9;   // anel 1 começa no tamanho do ponto
        const ring2R = dotR * 0.7;

        // Core: flash brilhante que expande e some
        const coreScale = progress.interpolate({
          inputRange: [0, 0.12, 0.45, 1],
          outputRange: [0, 1.0, 1.3, 1.8],
        });
        const coreOpacity = progress.interpolate({
          inputRange: [0, 0.08, 0.35, 1],
          outputRange: [0, 1, 0.5, 0],
        });

        // Anel 1: expande rápido saindo do tamanho do ponto
        const ring1Scale = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.1, 3.5],
        });
        const ring1Opacity = progress.interpolate({
          inputRange: [0, 0.08, 0.65, 1],
          outputRange: [0, 1.0, 0.5, 0],
        });

        // Anel 2: mais lento, cor diferente
        const ring2Scale = progress.interpolate({
          inputRange: [0, 0.08, 1],
          outputRange: [0, 0.2, 5.0],
        });
        const ring2Opacity = progress.interpolate({
          inputRange: [0, 0.1, 0.5, 1],
          outputRange: [0, 0.7, 0.3, 0],
        });

        // Halo difuso — mesmo tamanho do ponto, expande suavemente
        const haloScale = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 2.2],
        });
        const haloOpacity = progress.interpolate({
          inputRange: [0, 0.05, 0.4, 1],
          outputRange: [0, 0.35, 0.15, 0],
        });

        return (
          <View key={id} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {/* Halo difuso de fundo */}
            <Animated.View
              style={{
                position: 'absolute',
                left: x - dotR,
                top: y - dotR,
                width: dotR * 2,
                height: dotR * 2,
                borderRadius: dotR,
                backgroundColor: primaryColor,
                opacity: haloOpacity,
                transform: [{ scale: haloScale }],
              }}
            />

            {/* Anel 2 — mais lento, cor secundária */}
            <Animated.View
              style={{
                position: 'absolute',
                left: x - ring2R,
                top: y - ring2R,
                width: ring2R * 2,
                height: ring2R * 2,
                borderRadius: ring2R,
                borderWidth: 2,
                borderColor: secondaryColor,
                opacity: ring2Opacity,
                transform: [{ scale: ring2Scale }],
              }}
            />

            {/* Anel 1 — rápido, cor primária */}
            <Animated.View
              style={{
                position: 'absolute',
                left: x - ring1R,
                top: y - ring1R,
                width: ring1R * 2,
                height: ring1R * 2,
                borderRadius: ring1R,
                borderWidth: 2.5,
                borderColor: primaryColor,
                opacity: ring1Opacity,
                transform: [{ scale: ring1Scale }],
              }}
            />

            {/* Core — flash central */}
            <Animated.View
              style={{
                position: 'absolute',
                left: x - coreR,
                top: y - coreR,
                width: coreR * 2,
                height: coreR * 2,
                borderRadius: coreR,
                backgroundColor: coreColor,
                opacity: coreOpacity,
                transform: [{ scale: coreScale }],
              }}
            />
          </View>
        );
      })}

      {/* Hint de boas-vindas — some no primeiro clique */}
      <Animated.View
        pointerEvents="none"
        style={[styles.overlay, { opacity: hintOpacity }]}
      >
        <Animated.View style={[styles.hintCard, isDark && styles.hintCardDark, { transform: [{ scale: hintScale }] }]}>
          <Text style={styles.hintIcon}>👆</Text>
          <Text style={[styles.hintTitle, isDark && styles.hintTextDark]}>Toque na tela</Text>
          <Text style={[styles.hintSub, isDark && styles.hintSubDark]}>
            Clique em qualquer ponto para registrar{'\n'}e visualizar o mapa de calor
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Toast de confirmação do reset */}
      <Animated.View
        pointerEvents="none"
        style={[styles.overlay, { opacity: toastOpacity }]}
      >
        <Animated.View style={[styles.toastCard, isDark && styles.toastCardDark, { transform: [{ scale: toastScale }] }]}>
          <Text style={styles.toastIcon}>✅</Text>
          <Text style={[styles.toastTitle, isDark && styles.toastTitleDark]}>Dados resetados!</Text>
          <Text style={[styles.toastSub, isDark && styles.toastSubDark]}>
            Todos os cliques foram apagados
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Modal de informações sobre as cores */}
      <Modal
        visible={showInfo}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowInfo(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowInfo(false)}>
          <Pressable style={[styles.infoModal, isDark && styles.infoModalDark]}>
            <Text style={[styles.infoModalTitle, isDark && styles.infoModalTitleDark]}>
              Como funciona o Mapa de Calor
            </Text>
            <Text style={[styles.infoModalDesc, isDark && styles.infoModalDescDark]}>
              Cada toque na tela é registrado. A cor do ponto indica a frequência de cliques naquela região — quanto mais quente a cor, mais vezes aquela área foi tocada.
            </Text>

            <View style={styles.legendList}>
              {[
                { color: 'rgba(139, 92, 246, 0.75)',  label: 'Roxo',     desc: 'Menos clicado' },
                { color: 'rgba(59, 130, 246, 0.80)',  label: 'Azul',     desc: 'Pouco clicado' },
                { color: 'rgba(6, 182, 212, 0.85)',   label: 'Ciano',    desc: 'Moderado' },
                { color: 'rgba(34, 197, 94, 0.88)',   label: 'Verde',    desc: 'Frequente' },
                { color: 'rgba(234, 179, 8, 0.90)',   label: 'Amarelo',  desc: 'Muito frequente' },
                { color: 'rgba(249, 115, 22, 0.92)',  label: 'Laranja',  desc: 'Bastante clicado' },
                { color: 'rgba(239, 68, 68, 0.95)',   label: 'Vermelho', desc: 'Mais clicado' },
              ].map(({ color, label, desc }) => (
                <View key={label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <View style={styles.legendText}>
                    <Text style={[styles.legendLabel, isDark && styles.legendLabelDark]}>{label}</Text>
                    <Text style={[styles.legendDesc, isDark && styles.legendDescDark]}>{desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.infoCloseBtn, isDark && styles.infoCloseBtnDark, pressed && styles.btnPressed]}
              onPress={() => setShowInfo(false)}
            >
              <Text style={[styles.infoCloseBtnText, isDark && styles.infoCloseBtnTextDark]}>Entendi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Barra de controles no topo */}
      <View style={styles.topBar} pointerEvents="box-none">
        {/* Botões do lado esquerdo: dark theme + info */}
        <View style={styles.leftButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.themeToggle,
              isDark && styles.themeToggleDark,
              pressed && styles.btnPressed,
            ]}
            onPress={() => setIsDark(d => {
              const next = !d;
              AsyncStorage.setItem('theme', next ? 'dark' : 'light').catch(() => {});
              return next;
            })}
          >
            <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.themeToggle,
              isDark && styles.themeToggleDark,
              pressed && styles.btnPressed,
            ]}
            onPress={() => setShowInfo(true)}
          >
            <Text style={styles.infoIcon}>?</Text>
          </Pressable>
        </View>

        {/* Botão Resetar — maior e mais bonito */}
        <Pressable
          style={({ pressed }) => [
            styles.resetBtn,
            isDark && styles.resetBtnDark,
            pressed && styles.btnPressed,
          ]}
          onPress={handleReset}
        >
          {resetting ? (
            <ActivityIndicator size="small" color={isDark ? '#fca5a5' : '#ef4444'} />
          ) : (
            <Text style={[styles.resetBtnText, isDark && styles.resetBtnTextDark]}>
              ↺  Resetar
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  rootDark: {
    backgroundColor: '#0f172a',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  themeToggle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeToggleDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  themeToggleIcon: {
    fontSize: 22,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 18,
    backgroundColor: '#fff5f5',
    borderWidth: 2,
    borderColor: '#ef4444',
    minWidth: 140,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
  resetBtnDark: {
    backgroundColor: '#1e1e2e',
    borderColor: '#f87171',
    shadowColor: '#f87171',
  },
  resetBtnText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.4,
  },
  resetBtnTextDark: {
    color: '#f87171',
  },
  btnPressed: {
    opacity: 0.6,
  },
  heatDot: {
    position: 'absolute',
  },
  leftButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  infoIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#475569',
  },
  // Modal de informações
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  infoModal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    gap: 16,
  },
  infoModalDark: {
    backgroundColor: '#1e293b',
  },
  infoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  infoModalTitleDark: {
    color: '#f1f5f9',
  },
  infoModalDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    textAlign: 'center',
  },
  infoModalDescDark: {
    color: '#94a3b8',
  },
  legendList: {
    gap: 10,
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  legendText: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  legendLabelDark: {
    color: '#e2e8f0',
  },
  legendDesc: {
    fontSize: 12,
    color: '#94a3b8',
  },
  legendDescDark: {
    color: '#64748b',
  },
  infoCloseBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  infoCloseBtnDark: {
    backgroundColor: '#0f172a',
  },
  infoCloseBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  infoCloseBtnTextDark: {
    color: '#94a3b8',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Hint de boas-vindas
  hintCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  hintCardDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.97)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hintIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  hintTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.2,
  },
  hintSub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  hintTextDark: {
    color: '#f1f5f9',
  },
  hintSubDark: {
    color: '#94a3b8',
  },
  // Toast de reset
  toastCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 197, 94, 0.40)',
  },
  toastCardDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  toastIcon: {
    fontSize: 36,
    marginBottom: 2,
  },
  toastTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#15803d',
    letterSpacing: 0.2,
  },
  toastTitleDark: {
    color: '#4ade80',
  },
  toastSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  toastSubDark: {
    color: '#94a3b8',
  },
});
