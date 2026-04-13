# App Mapa de Calor

Aplicativo mobile em React Native + Expo que registra cada toque na tela e exibe, em tempo real, um mapa de calor sobreposto com as regiões mais clicadas.

## Stack

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- AsyncStorage (persistência do tema)

## Como rodar

```bash
npm install
npm start
```

Abra o QR Code no Expo Go (Android/iOS) ou rode `npm run android` / `npm run ios` / `npm run web`.

Verificação de tipos:

```bash
npm run typecheck
```

## O que o app faz

- Toque em qualquer lugar da tela para registrar um clique.
- Cada clique dispara uma animação de flash (núcleo + anéis concêntricos + halo) no ponto tocado.
- Os pontos são agrupados em clusters por proximidade e renderizados como um heatmap colorido sobre a tela.
- A cor reflete a frequência: roxo (menos clicado) → azul → ciano → verde → amarelo → laranja → vermelho (mais clicado).
- **Tema claro/escuro** com paletas distintas de cores do heatmap, alternável pelo botão 🌙/☀️ e persistido via AsyncStorage.
- Botão **?** abre um modal com a legenda completa das cores.
- Botão **↺ Resetar** apaga todos os cliques da sessão e exibe um toast de confirmação.
- Hint de boas-vindas com pulso suave que some no primeiro toque.

## Backend

O app consome uma API REST hospedada em `https://rest-api-black-omega.vercel.app` (configurável em [`src/services/backendUrl.ts`](./src/services/backendUrl.ts)).

Endpoints usados por [`src/services/heatmapApi.ts`](./src/services/heatmapApi.ts):

| Método | Rota | Função |
|---|---|---|
| `POST` | `/sessions` | Cria uma nova sessão ao abrir o app (`initSession`) |
| `POST` | `/sessions/:id/clicks` | Envia coordenadas normalizadas (0–1) de cada toque (`sendClick`) |
| `GET`  | `/sessions/:id/clicks` | Busca a lista de cliques da sessão (`getClicks`) |
| `DELETE` | `/sessions/:id/clicks` | Limpa os cliques e encerra a sessão atual (`resetClicks`) |

As coordenadas são enviadas normalizadas em relação ao tamanho da área de captura, então o heatmap funciona em qualquer resolução. No client, os pontos brutos passam por um agrupamento por proximidade (`clusterPoints`, raio padrão `0.05`) e recebem um peso relativo usado para escolher a cor.

## Estrutura

```
App.tsx                       # UI, heatmap overlay, animações, tema, controles
src/services/heatmapApi.ts    # Cliente REST, sessão, clustering de pontos
src/services/backendUrl.ts    # URL base do backend
```
