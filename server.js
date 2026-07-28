// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// A 4 MB audio file becomes larger after Base64 encoding.
app.use(express.json({ limit: "8mb" }));

// Read the Inworld credential submitted through the browser.
// This does not read INWORLD_API_KEY from .env.
function getRequestAuthHeader(req) {
  const browserAuthorization = req.get("authorization")?.trim();

  if (!browserAuthorization) {
    return "";
  }

  // This application only supports Basic authentication.
  if (!/^Basic\s+\S+$/i.test(browserAuthorization)) {
    return "";
  }

  return browserAuthorization;
}

function requireBasicAuthorization(req, res) {
  const authorization = getRequestAuthHeader(req);

  if (!authorization) {
    res.status(401).json({
      error:
        "Enter a valid Inworld Base64 API credential in the browser.",
    });

    return null;
  }

  return authorization;
}

async function readUpstreamResponse(response) {
  const rawText = await response.text();

  try {
    return JSON.parse(rawText);
  } catch {
    return {
      message:
        rawText || `Inworld returned HTTP ${response.status}`,
    };
  }
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// GET /api/voices
app.get("/api/voices", async (req, res) => {
  try {
    const authorization = requireBasicAuthorization(req, res);

    if (!authorization) return;

    const response = await fetch(
      "https://api.inworld.ai/voices/v1/voices",
      {
        method: "GET",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
      },
    );

    const data = await readUpstreamResponse(response);

    if (!response.ok) {
      console.error(
        "Inworld voice fetch failed:",
        response.status,
        data,
      );

      return res.status(response.status).json({
        error: "Failed to fetch voices",
        details: data,
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Voice proxy error:", error);

    return res.status(500).json({
      error: "Internal server error while fetching voices",
    });
  }
});

// POST /api/voices/clone
app.post("/api/voices/clone", async (req, res) => {
  try {
    const authorization = requireBasicAuthorization(req, res);

    if (!authorization) return;

    const {
      displayName,
      langCode = "EN_US",
      audioData,
      fileName,
      transcription = "",
      description = "",
      removeBackgroundNoise = true,
      permissionConfirmed = false,
    } = req.body || {};

    if (!permissionConfirmed) {
      return res.status(400).json({
        error: "Voice-owner permission must be confirmed",
      });
    }

    if (!displayName?.trim()) {
      return res.status(400).json({
        error: "Voice name is required",
      });
    }

    if (!audioData || typeof audioData !== "string") {
      return res.status(400).json({
        error: "Audio sample is required",
      });
    }

    const allowedExtensions = new Set([
      ".wav",
      ".mp3",
      ".webm",
    ]);

    const extension = path
      .extname(fileName || "")
      .toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return res.status(400).json({
        error: "Only WAV, MP3, and WebM files are supported",
      });
    }

    // Accept either plain Base64 or a browser data URL.
    const base64Audio = audioData
      .replace(/^data:[^;]+;base64,/, "")
      .replace(/\s/g, "");

    const audioBuffer = Buffer.from(base64Audio, "base64");

    if (!audioBuffer.length) {
      return res.status(400).json({
        error: "The audio sample is empty or invalid",
      });
    }

    if (audioBuffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({
        error: "The audio sample must be 4 MB or smaller",
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
        description.trim() ||
        `Cloned voice: ${displayName.trim()}`,
      tags: ["clone"],
      audioProcessingConfig: {
        removeBackgroundNoise: Boolean(
          removeBackgroundNoise,
        ),
      },
    };

    const response = await fetch(
      "https://api.inworld.ai/voices/v1/voices:clone",
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const data = await readUpstreamResponse(response);

    if (!response.ok) {
      console.error(
        "Inworld voice cloning failed:",
        response.status,
        data,
      );

      return res.status(response.status).json({
        error: "Voice cloning failed",
        details: data,
      });
    }

    // Avoid returning the large validated Base64 audio.
    const validationResults = Array.isArray(
      data.audioSamplesValidated,
    )
      ? data.audioSamplesValidated.map(
          ({ audioData: _audioData, ...result }) => result,
        )
      : [];

    return res.json({
      voice: data.voice,
      audioSamplesValidated: validationResults,
    });
  } catch (error) {
    console.error("Voice cloning proxy error:", error);

    return res.status(500).json({
      error:
        "Internal server error while cloning the voice",
    });
  }
});

// POST /api/tts
app.post("/api/tts", async (req, res) => {
  try {
    const authorization = requireBasicAuthorization(req, res);

    if (!authorization) return;

    const response = await fetch(
      "https://api.inworld.ai/tts/v1/voice:stream",
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      },
    );

    if (!response.ok) {
      const data = await readUpstreamResponse(response);

      console.error(
        "Inworld TTS request failed:",
        response.status,
        data,
      );

      return res.status(response.status).json({
        error: "TTS synthesis failed",
        details: data,
      });
    }

    const rawText = await response.text();

    let chunks;

    try {
      const parsed = JSON.parse(rawText);
      chunks = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Convert concatenated JSON objects into an array.
      const normalized = `[${rawText.replace(
        /\}\s*\{/g,
        "},{",
      )}]`;

      chunks = JSON.parse(normalized);
    }

    return res.json(chunks);
  } catch (error) {
    console.error("TTS proxy error:", error);

    return res.status(500).json({
      error:
        "Internal server error while generating speech",
    });
  }
});

// Serve the Vite production build.
app.use(express.static(path.join(__dirname, "dist")));

// Serve React for non-API routes.
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  return res.sendFile(
    path.join(__dirname, "dist", "index.html"),
  );
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Proxy server running on http://localhost:${PORT}`,
  );
});

server.on("error", (error) => {
  console.error("Server error:", error);
});