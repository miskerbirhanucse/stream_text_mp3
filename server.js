// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
  })
);

app.use(express.json());

const AUTH_HEADER = `Basic ${process.env.INWORLD_API_KEY}`;

// PROXY: GET /api/voices
app.get('/api/voices', async (req, res) => {

  try {
    // Debug
    console.log('ENV key loaded:', !!process.env.INWORLD_API_KEY);
    console.log('Auth header:', AUTH_HEADER.substring(0, 20) + '...');

    const response = await fetch('https://api.inworld.ai/voices/v1/voices', {
      method: 'GET',
      headers: {
        Authorization: AUTH_HEADER,
        'Content-Type': 'application/json',
      },
    });
    console.log('Inworld response status:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.error('Upstream voice fetch failed:', response.status, errText);
      return res.status(response.status).json({ error: 'Failed to fetch voices', details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PROXY: POST /api/tts
// app.post('/api/tts', async (req, res) => {
//   try {
//     const response = await fetch('https://api.inworld.ai/voices/v1/tts', {
//       method: 'POST',
//       headers: {
//         Authorization: AUTH_HEADER,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(req.body),
//     });

//     if (!response.ok) {
//       const errText = await response.text();
//       console.error('TTS request failed:', response.status, errText);
//       return res.status(response.status).json({ error: 'TTS synthesis failed', details: errText });
//     }

//     const data = await response.json();
//     res.json(data);
//   } catch (error) {
//     console.error('TTS proxy error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });
// app.post('/api/tts', async (req, res) => {
//   try {
//     const response = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
//       method: 'POST',
//       headers: {
//         Authorization: AUTH_HEADER,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(req.body),
//     });

//     if (!response.ok) {
//       const errText = await response.text();
//       console.error('TTS request failed:', response.status, errText);
//       return res.status(response.status).json({ error: 'TTS synthesis failed', details: errText });
//     }

//     // Stream the response back to the client
//     res.setHeader('Content-Type', 'application/json');
//     res.setHeader('Transfer-Encoding', 'chunked');

//     const reader = response.body.getReader();
//     const decoder = new TextDecoder();

//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) break;
//       const chunk = decoder.decode(value, { stream: true });
//       res.write(chunk);
//     }

//     res.end();
//   } catch (error) {
//     console.error('TTS proxy error:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });
app.post('/api/tts', async (req, res) => {
  try {
    const response = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
      method: 'POST',
      headers: {
        Authorization: AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('TTS request failed:', response.status, errText);
      return res.status(response.status).json({ error: 'TTS synthesis failed', details: errText });
    }

    // Collect full response and fix concatenated JSON
    const rawText = await response.text();
    const jsonArrayStr = '[' + rawText.replace(/\}\s*\{/g, '},{') + ']';
    const chunks = JSON.parse(jsonArrayStr);

    res.json(chunks);
  } catch (error) {
    console.error('TTS proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
