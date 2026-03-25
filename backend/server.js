require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BACKEND_URL_FILE = path.resolve(__dirname, '../src/services/backendUrl.ts');

const app = express();
const PORT = 3001;

/** @type {{ x: number, y: number }[]} */
let clicks = [];

app.use(cors());
app.use(express.json());

/**
 * POST /api/clicks
 * Body: { x: number, y: number }  (valores normalizados 0-1)
 */
app.post('/api/clicks', (req, res) => {
  const { x, y } = req.body;

  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'x e y são obrigatórios e devem ser números' });
  }

  const nx = Math.max(0, Math.min(1, x));
  const ny = Math.max(0, Math.min(1, y));

  clicks.push({ x: nx, y: ny });

  return res.status(201).json({ ok: true, total: clicks.length });
});

/**
 * GET /api/clicks
 * Retorna todos os cliques brutos.
 * Response: { total: number, points: { x, y }[] }
 */
app.get('/api/clicks', (req, res) => {
  return res.json({ total: clicks.length, points: clicks });
});

/**
 * DELETE /api/clicks
 * Reseta todos os cliques.
 */
app.delete('/api/clicks', (req, res) => {
  clicks = [];
  return res.json({ ok: true });
});

app.listen(PORT, async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

  try {
    const ngrok = require('@ngrok/ngrok');
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: process.env.NGROK_AUTHTOKEN,
    });
    const url = listener.url();

    // Atualiza backendUrl.ts automaticamente para o Expo pegar na próxima recarga
    fs.writeFileSync(
      BACKEND_URL_FILE,
      `// Arquivo gerado automaticamente pelo backend ao iniciar.\n// Não edite manualmente.\nexport const BACKEND_URL = '${url}';\n`,
      'utf8',
    );

    console.log('\n=========================================');
    console.log('BACKEND PÚBLICO:', url);
    console.log('backendUrl.ts atualizado automaticamente.');
    console.log('=========================================\n');
  } catch (err) {
    console.warn('Não foi possível criar o tunnel:', err.message);
    console.warn('Defina a variável NGROK_AUTHTOKEN com seu token de https://ngrok.com');
  }
});
