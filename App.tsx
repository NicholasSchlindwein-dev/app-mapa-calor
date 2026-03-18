import * as NavigationBar from 'expo-navigation-bar';
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  clearTapSession,
  getTapSummary,
  recordTap,
} from './src/services/mockHeatmapApi';

const TARGET_COUNT = 8;
const GRID_COLUMNS = 2;
const GRID_ROWS = 4;
const ROUND_INTERVAL_MS = 2000;
const TARGET_SIZE = 84;
const PAUSE_SIZE = 84;
const PHONE_PREVIEW_RATIO = 2.08;

const TARGET_SLOTS = Array.from({ length: TARGET_COUNT }, (_, index) => {
  const row = Math.floor(index / GRID_COLUMNS);
  const column = index % GRID_COLUMNS;
  const left = column === 0 ? 0.16 : 0.84;
  const topByRow = [0.09, 0.27, 0.73, 0.91];

  return {
    left,
    top: topByRow[row],
  };
});

type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const emptyLayout = (): LayoutBox => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

function pickNextTarget(previous: number | null) {
  const pool = Array.from({ length: TARGET_COUNT }, (_, index) => index).filter(
    (index) => index !== previous,
  );
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalize(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getHeatColor(weight: number) {
  const alpha = 0.16 + weight * 0.46;

  if (weight > 0.7) {
    return `rgba(255, 88, 88, ${alpha})`;
  }

  if (weight > 0.38) {
    return `rgba(255, 176, 69, ${alpha})`;
  }

  return `rgba(126, 231, 255, ${alpha})`;
}

function getTimerColor(ratio: number) {
  if (ratio > 0.55) return '#8be5ff';
  if (ratio > 0.28) return '#ffb045';
  return '#ff5858';
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const arenaWidth = Math.max(280, Math.min(width - 12, 380));
  const arenaHeight = Math.max(500, Math.min(height - 88, 720));
  const phoneWidth = Math.min(width - 64, height * 0.42, 292);
  const phoneHeight = phoneWidth * PHONE_PREVIEW_RATIO;

  const [activeTarget, setActiveTarget] = useState<number>(() => pickNextTarget(null));
  const [score, setScore] = useState(0);
  const [totalTaps, setTotalTaps] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [modalMode, setModalMode] = useState<'pause' | 'heatmap' | null>(null);
  const [roundClaimed, setRoundClaimed] = useState(false);
  const [roundEndsAt, setRoundEndsAt] = useState(Date.now() + ROUND_INTERVAL_MS);
  const [timeLeft, setTimeLeft] = useState(ROUND_INTERVAL_MS);
  const [screenLayout, setScreenLayout] = useState<LayoutBox>({
    x: 0,
    y: 0,
    width,
    height,
  });
  const [arenaLayout, setArenaLayout] = useState<LayoutBox>(emptyLayout);
  const [targetLayouts, setTargetLayouts] = useState<LayoutBox[]>(
    Array.from({ length: TARGET_COUNT }, emptyLayout),
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const pulse = useRef(new Animated.Value(0)).current;
  const scoreScale = useRef(new Animated.Value(1)).current;
  const summary = useMemo(() => getTapSummary(), [refreshKey]);

  const timerRatio = timeLeft / ROUND_INTERVAL_MS;
  const accuracy = totalTaps > 0 ? Math.round((score / totalTaps) * 100) : null;
  const timerColor = getTimerColor(timerRatio);

  useEffect(() => {
    setScreenLayout((current) => ({
      ...current,
      width,
      height,
    }));
  }, [height, width]);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');

    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => undefined);

      const subscription = NavigationBar.addVisibilityListener(({ visibility }) => {
        if (visibility !== 'hidden') {
          NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
        }
      });

      return () => {
        subscription.remove();
        NavigationBar.setVisibilityAsync('visible').catch(() => undefined);
        StatusBar.setHidden(false, 'fade');
      };
    }

    return () => {
      StatusBar.setHidden(false, 'fade');
    };
  }, []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    if (score === 0) return;
    Animated.sequence([
      Animated.timing(scoreScale, {
        toValue: 1.4,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.spring(scoreScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 10,
        stiffness: 180,
      } as any),
    ]).start();
  }, [score]);

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, roundEndsAt - now);
      setTimeLeft(remaining);

      if (remaining === 0) {
        setActiveTarget((current) => pickNextTarget(current));
        setRoundClaimed(false);
        setRoundEndsAt(now + ROUND_INTERVAL_MS);
        setTimeLeft(ROUND_INTERVAL_MS);
      }
    }, 120);

    return () => clearInterval(interval);
  }, [isPaused, roundEndsAt]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.68],
  });

  function syncSummary() {
    setRefreshKey((current) => current + 1);
  }

  function handleTargetLayout(index: number, layout: LayoutBox) {
    setTargetLayouts((current) => {
      const next = [...current];
      next[index] = layout;
      return next;
    });
  }

  function handleTargetPress(index: number, x: number, y: number) {
    const targetLayout = targetLayouts[index];
    const absoluteX = arenaLayout.x + targetLayout.x + x;
    const absoluteY = arenaLayout.y + targetLayout.y + y;
    const isHit = index === activeTarget && !roundClaimed;

    recordTap({
      x: normalize(absoluteX / Math.max(1, screenLayout.width)),
      y: normalize(absoluteY / Math.max(1, screenLayout.height)),
      isHit,
      targetIndex: activeTarget,
      pressedIndex: index,
      roundAt: Date.now(),
    });

    setTotalTaps((current) => current + 1);

    if (isHit) {
      setScore((current) => current + 1);
      setRoundClaimed(true);
    }

    syncSummary();
  }

  function pauseGame() {
    setIsPaused(true);
    setModalMode('pause');
  }

  function resumeGame() {
    startTransition(() => {
      setModalMode(null);
      setIsPaused(false);
      setRoundEndsAt(Date.now() + Math.max(1, timeLeft));
    });
  }

  function openHeatmap() {
    startTransition(() => {
      setModalMode('heatmap');
    });
  }

  function goBackToPauseModal() {
    startTransition(() => {
      setModalMode('pause');
    });
  }

  function resetGame() {
    clearTapSession();
    startTransition(() => {
      setScore(0);
      setTotalTaps(0);
      setIsPaused(false);
      setModalMode(null);
      setRoundClaimed(false);
      setActiveTarget(pickNextTarget(null));
      setRoundEndsAt(Date.now() + ROUND_INTERVAL_MS);
      setTimeLeft(ROUND_INTERVAL_MS);
      setRefreshKey((current) => current + 1);
    });
  }

  return (
    <View
      style={styles.screen}
      onLayout={(event) =>
        setScreenLayout({
          x: event.nativeEvent.layout.x,
          y: event.nativeEvent.layout.y,
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      <StatusBar hidden animated />

      {/* Score + Accuracy + Timer */}
      <View style={styles.topArea}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBlock}>
            <Animated.Text
              style={[styles.counter, { transform: [{ scale: scoreScale }] }]}
            >
              {score}
            </Animated.Text>
            <Text style={styles.scoreLabel}>ACERTOS</Text>
          </View>

          {accuracy !== null ? (
            <View style={styles.accuracyBadge}>
              <Text style={styles.accuracyValue}>{accuracy}%</Text>
              <Text style={styles.accuracyLabel}>ACURÁCIA</Text>
            </View>
          ) : null}
        </View>

        {/* Timer bar */}
        <View style={[styles.timerTrack, { width: arenaWidth }]}>
          <View
            style={[
              styles.timerFill,
              {
                width: `${timerRatio * 100}%`,
                backgroundColor: timerColor,
                shadowColor: timerColor,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={[styles.arena, { width: arenaWidth, height: arenaHeight }]}
        onLayout={(event) =>
          setArenaLayout({
            x: event.nativeEvent.layout.x,
            y: event.nativeEvent.layout.y,
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        {TARGET_SLOTS.map((slot, index) => {
          const isActive = index === activeTarget;
          const isCaptured = isActive && roundClaimed;

          return (
            <Pressable
              key={index}
              onLayout={(event) =>
                handleTargetLayout(index, {
                  x: event.nativeEvent.layout.x,
                  y: event.nativeEvent.layout.y,
                  width: event.nativeEvent.layout.width,
                  height: event.nativeEvent.layout.height,
                })
              }
              onPress={(event) =>
                handleTargetPress(
                  index,
                  event.nativeEvent.locationX,
                  event.nativeEvent.locationY,
                )
              }
              disabled={isPaused}
              style={[
                styles.targetButton,
                {
                  left: slot.left * arenaWidth - TARGET_SIZE / 2,
                  top: slot.top * arenaHeight - TARGET_SIZE / 2,
                },
              ]}
            >
              {isActive ? (
                <Animated.View
                  style={[
                    styles.targetPulse,
                    {
                      opacity: pulseOpacity,
                      transform: [{ scale: pulseScale }],
                    },
                  ]}
                />
              ) : null}

              <View
                style={[
                  styles.targetShell,
                  isActive && styles.targetShellActive,
                  isCaptured && styles.targetShellCaptured,
                ]}
              >
                {isActive || isCaptured ? (
                  <View
                    style={[
                      styles.targetCore,
                      isActive && styles.targetCoreActive,
                      isCaptured && styles.targetCoreCaptured,
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}

        <Pressable
          onPress={pauseGame}
          style={({ pressed }) => [
            styles.pauseButton,
            {
              left: arenaWidth / 2 - PAUSE_SIZE / 2,
              top: arenaHeight / 2 - PAUSE_SIZE / 2,
            },
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.pauseIcon}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        </Pressable>
      </View>

      {/* Pause Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={modalMode === 'pause'}
        onRequestClose={resumeGame}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pausado</Text>

            {/* Score recap */}
            <View style={styles.pauseScoreBlock}>
              <Text style={styles.pauseScoreNumber}>{score}</Text>
              <Text style={styles.pauseScoreUnit}>acertos</Text>
              {accuracy !== null ? (
                <View style={styles.pauseAccuracyPill}>
                  <Text style={styles.pauseAccuracyText}>{accuracy}% acurácia</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.modalText}>
              Escolha se quer abrir o mapa de calor ou reiniciar a partida.
            </Text>

            <Pressable
              onPress={openHeatmap}
              style={({ pressed }) => [
                styles.modalPrimaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.modalPrimaryText}>Ver gráfico de calor</Text>
            </Pressable>

            <Pressable
              onPress={resetGame}
              style={({ pressed }) => [
                styles.modalSecondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.modalSecondaryText}>Reiniciar jogo</Text>
            </Pressable>

            <Pressable onPress={resumeGame} style={styles.modalGhostButton}>
              <Text style={styles.modalGhostText}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Heatmap Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={modalMode === 'heatmap'}
        onRequestClose={goBackToPauseModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.heatmapCard, { maxHeight: height * 0.88 }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces
              contentContainerStyle={styles.heatmapScroll}
            >
              <Text style={styles.modalTitle}>Mapa de calor</Text>

              {/* Stats row */}
              {summary.total > 0 ? (
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{summary.total}</Text>
                    <Text style={styles.statLabel}>TOQUES</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{score}</Text>
                    <Text style={styles.statLabel}>ACERTOS</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, styles.statValueAccent]}>
                      {accuracy}%
                    </Text>
                    <Text style={styles.statLabel}>ACURÁCIA</Text>
                  </View>
                </View>
              ) : null}

              {summary.total > 0 ? (
                <View style={styles.zoneRow}>
                  <Text style={styles.zoneLabel}>Zona mais quente: </Text>
                  <Text style={styles.zoneValue}>{summary.hottestZoneLabel}</Text>
                </View>
              ) : null}

              <Text style={styles.modalText}>
                Intensidade maior significa mais toques concentrados naquela área.
              </Text>

              <View style={[styles.phoneFrame, { width: phoneWidth, height: phoneHeight }]}>
                <View style={styles.phoneNotch} />
                <View style={styles.phoneScreen}>
                  <Text style={styles.phoneCounter}>{score}</Text>

                  {summary.points.map((point) => {
                    const size = 52 + point.weight * 88;

                    return (
                      <View
                        key={point.id}
                        style={[
                          styles.heatSpot,
                          {
                            left: `${point.x * 100}%`,
                            top: `${point.y * 100}%`,
                            width: size,
                            height: size,
                            backgroundColor: getHeatColor(point.weight),
                            borderColor: point.isHit
                              ? 'rgba(135, 255, 191, 0.42)'
                              : 'rgba(255, 130, 88, 0.24)',
                          },
                        ]}
                      />
                    );
                  })}

                  {summary.total === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>Sem cliques ainda</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Color legend */}
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: 'rgba(126, 231, 255, 0.7)' }]} />
                  <Text style={styles.legendText}>Poucos</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: 'rgba(255, 176, 69, 0.7)' }]} />
                  <Text style={styles.legendText}>Médio</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: 'rgba(255, 88, 88, 0.7)' }]} />
                  <Text style={styles.legendText}>Muitos</Text>
                </View>
              </View>

              <Pressable
                onPress={goBackToPauseModal}
                style={({ pressed }) => [
                  styles.modalSecondaryButton,
                  styles.backButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalSecondaryText}>← Voltar</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 20,
  },

  /* Top area: score + timer */
  topArea: {
    alignItems: 'center',
    gap: 10,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  scoreBlock: {
    alignItems: 'center',
  },
  counter: {
    color: '#f8fbff',
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 58,
  },
  scoreLabel: {
    color: '#3a5272',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  accuracyBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(139, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 229, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
  },
  accuracyValue: {
    color: '#8be5ff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  accuracyLabel: {
    color: '#3a6080',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 1,
  },

  /* Timer bar */
  timerTrack: {
    height: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 99,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  /* Arena */
  arena: {
    position: 'relative',
    marginBottom: 18,
  },
  targetButton: {
    position: 'absolute',
    width: TARGET_SIZE,
    height: TARGET_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  targetPulse: {
    position: 'absolute',
    width: TARGET_SIZE + 26,
    height: TARGET_SIZE + 26,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 216, 255, 0.2)',
  },
  targetShell: {
    width: TARGET_SIZE,
    height: TARGET_SIZE,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#0a1222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetShellActive: {
    borderColor: 'rgba(135, 225, 255, 0.88)',
    backgroundColor: 'rgba(135, 225, 255, 0.18)',
  },
  targetShellCaptured: {
    borderColor: 'rgba(128, 255, 177, 0.88)',
    backgroundColor: 'rgba(128, 255, 177, 0.2)',
  },
  targetCore: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  targetCoreActive: {
    backgroundColor: '#8be5ff',
  },
  targetCoreCaptured: {
    backgroundColor: '#87ffbf',
  },
  pauseButton: {
    position: 'absolute',
    width: PAUSE_SIZE,
    height: PAUSE_SIZE,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pauseIcon: {
    flexDirection: 'row',
    gap: 8,
  },
  pauseBar: {
    width: 8,
    height: 28,
    borderRadius: 99,
    backgroundColor: '#f8fbff',
  },

  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(1, 4, 14, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 30,
    backgroundColor: '#071122',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
  },
  heatmapCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 30,
    backgroundColor: '#071122',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  heatmapScroll: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#f8fbff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  modalText: {
    color: '#8ea7c4',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },

  /* Pause modal score recap */
  pauseScoreBlock: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 229, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(139, 229, 255, 0.1)',
  },
  pauseScoreNumber: {
    color: '#f8fbff',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: -3,
    lineHeight: 68,
  },
  pauseScoreUnit: {
    color: '#3a6080',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  pauseAccuracyPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(139, 229, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 229, 255, 0.25)',
  },
  pauseAccuracyText: {
    color: '#8be5ff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Modal buttons */
  modalPrimaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#8be5ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalPrimaryText: {
    color: '#04111f',
    fontSize: 16,
    fontWeight: '800',
  },
  modalSecondaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    color: '#f8fbff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalGhostButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingVertical: 6,
  },
  modalGhostText: {
    color: '#88a1bf',
    fontSize: 15,
    fontWeight: '600',
  },

  /* Heatmap stats */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    width: '100%',
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#f8fbff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  statValueAccent: {
    color: '#8be5ff',
  },
  statLabel: {
    color: '#3a5272',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 2,
  },
  zoneLabel: {
    color: '#8ea7c4',
    fontSize: 13,
    fontWeight: '500',
  },
  zoneValue: {
    color: '#f8fbff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Phone preview */
  phoneFrame: {
    borderRadius: 38,
    backgroundColor: '#0d1627',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  phoneNotch: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    width: 112,
    height: 22,
    borderRadius: 14,
    backgroundColor: '#020617',
    zIndex: 3,
  },
  phoneScreen: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#020817',
  },
  phoneCounter: {
    color: '#f8fbff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.6,
    textAlign: 'center',
    marginTop: 34,
  },
  heatSpot: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    transform: [{ translateX: -44 }, { translateY: -44 }],
  },
  emptyState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: '#8aa3be',
    fontSize: 15,
    fontWeight: '600',
  },

  /* Legend */
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
  },
  legendText: {
    color: '#8ea7c4',
    fontSize: 12,
    fontWeight: '600',
  },

  backButton: {
    width: '100%',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
