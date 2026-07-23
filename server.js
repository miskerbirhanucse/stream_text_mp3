// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
  })
);

app.use(express.json({ limit: '8mb' }));

const rawInworldKey = process.env.INWORLD_API_KEY?.trim() || '';

const AUTH_HEADER = rawInworldKey.startsWith('Basic ')
  ? rawInworldKey
  : `Basic ${rawInworldKey}`;
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

// PROXY: POST /api/voices/clone
app.post('/api/voices/clone', async (req, res) => {
  try {
    if (!rawInworldKey) {
      return res.status(500).json({
        error: 'INWORLD_API_KEY is missing from the server environment',
      });
    }

    const {
      displayName,
      langCode = 'EN_US',
      audioData,
      fileName,
      transcription = '',
      description = '',
      removeBackgroundNoise = true,
      permissionConfirmed = false,
    } = req.body || {};

    if (!permissionConfirmed) {
      return res.status(400).json({
        error: 'Voice-owner permission must be confirmed',
      });
    }

    if (!displayName?.trim()) {
      return res.status(400).json({
        error: 'Voice name is required',
      });
    }

    if (!audioData || typeof audioData !== 'string') {
      return res.status(400).json({
        error: 'Audio sample is required',
      });
    }

    const allowedExtensions = new Set(['.wav', '.mp3', '.webm']);
    const extension = path.extname(fileName || '').toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return res.status(400).json({
        error: 'Only WAV, MP3, and WebM files are supported',
      });
    }

    // Accept either plain Base64 or a browser data URL.
    const base64Audio = audioData
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s/g, '');

    const audioBuffer = Buffer.from(base64Audio, 'base64');

    if (!audioBuffer.length) {
      return res.status(400).json({
        error: 'The audio sample is empty or invalid',
      });
    }

    const maxFileSize = 4 * 1024 * 1024;

    if (audioBuffer.length > maxFileSize) {
      return res.status(400).json({
        error: 'The audio sample must be 4 MB or smaller',
      });
    }

    const voiceSample = {
      audioData: base64Audio,
    };

    if (transcription.trim()) {
      voiceSample.transcription = transcription.trim();
    }

    const payload = {
      displayName: displayName.trim(),
      langCode,
      voiceSamples: [voiceSample],
      description:
        description.trim() || `Cloned voice: ${displayName.trim()}`,
      tags: ['clone'],
      audioProcessingConfig: {
        removeBackgroundNoise: Boolean(removeBackgroundNoise),
      },
    };

    const response = await fetch(
      'https://api.inworld.ai/voices/v1/voices:clone',
      {
        method: 'POST',
        headers: {
          Authorization: AUTH_HEADER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const rawResponse = await response.text();

    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      data = { message: rawResponse };
    }

    if (!response.ok) {
      console.error('Voice cloning failed:', response.status, data);

      return res.status(response.status).json({
        error: 'Voice cloning failed',
        details: data,
      });
    }

    // Do not send the large validated Base64 audio back to the browser.
    const validationResults = Array.isArray(data.audioSamplesValidated)
      ? data.audioSamplesValidated.map(({ audioData: _, ...result }) => result)
      : [];

    return res.json({
      voice: data.voice,
      audioSamplesValidated: validationResults,
    });
  } catch (error) {
    console.error('Voice cloning proxy error:', error);

    return res.status(500).json({
      error: 'Internal server error while cloning the voice',
    });
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

app.use(express.static(path.join(__dirname, 'dist')));

// Serve React app for all non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }

  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
