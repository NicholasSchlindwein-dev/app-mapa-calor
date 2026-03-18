# Heat Tap Arena

Frontend mobile em React Native com Expo para um jogo simples de acerto em alvo com visualizacao de mapa de calor.

## Stack

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript

## Como rodar

```bash
npm install
npm start
```

Depois, abra o QR Code no Expo Go.

## O que o app faz

- Mostra 8 circulos em uma grade 2x4.
- Um alvo acende a cada 5 segundos.
- Clique no alvo aceso para pontuar.
- Pause o jogo para abrir o mapa de calor dos cliques da sessao.
- Usa um mock local em [`src/services/mockHeatmapApi.ts`](./src/services/mockHeatmapApi.ts) no lugar do backend real.

## Troca futura pelo backend da turma

Quando o contrato do backend chegar, o ponto de troca principal sera o modulo [`src/services/mockHeatmapApi.ts`](./src/services/mockHeatmapApi.ts):

- `recordTap`: enviar coordenadas do clique.
- `getTapSummary`: buscar dados agregados do mapa de calor.
- `clearTapSession`: limpar ou reiniciar a sessao.
