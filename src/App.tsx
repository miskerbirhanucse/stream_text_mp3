  import { useState, useRef, useCallback } from "react";
  import { cn } from "@/utils/cn";

  interface Voice {
    voiceId: string;
    displayName: string;
    description: string;
    tags: string[];
    languages: string[];
  }

  interface Chunk {
    id: number;
    text: string;
    status: "pending" | "processing" | "completed" | "error";
    audioBlob?: Blob;
    error?: string;
  }

  const MAX_CHARS = 1900;

  export function App() {
    const [inputText, setInputText] = useState<string>("");
    
    // JWT Authentication
    const [jwtToken, setJwtToken] = useState<string>("");
    const [workspaceId, setWorkspaceId] = useState<string>("default-oxqw6yz59ix893entop-lw");
    
    // Legacy Basic Auth (fallback)
    const [apiKey, setApiKey] = useState<string>("Basic ZkNCbDZkUzVHRFZySUx0bjlhaGE0cjZDRnJmMk1jNlc6akYwM0JQYVNiWmdrWlh6SG9JeDhSMzZodWFyeWdFZ3pzdUl2akRSaWZndXUwQ2dHc0dwS1F2SG8yU2RoYk9yQw==");
    const [useBasicAuth, setUseBasicAuth] = useState<boolean>(false);
    
    const [voiceId, setVoiceId] = useState<string>("");
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState<boolean>(false);
    const [voicesError, setVoicesError] = useState<string>("");
    const [chunks, setChunks] = useState<Chunk[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
    const [temperature, setTemperature] = useState<number>(1.1);
    const [speakingRate, setSpeakingRate] = useState<number>(1);
    const [modelId, setModelId] = useState<string>("inworld-tts-1.5-max");
    const abortControllerRef = useRef<AbortController | null>(null);

    // Get authorization header based on auth method
    const getAuthHeader = useCallback(() => {
      if (useBasicAuth) {
        return apiKey;
      }
      return `Bearer ${jwtToken}`;
    }, [useBasicAuth, apiKey, jwtToken]);

    // Fetch voices from API
    // const fetchVoices = useCallback(async () => {
    //   // Check if we have authentication
    //   if (useBasicAuth && !apiKey) {
    //     setVoicesError("Please enter an API key");
    //     return;
    //   }
    //   if (!useBasicAuth && !jwtToken) {
    //     setVoicesError("Please enter a JWT token");
    //     return;
    //   }
    //   if (!workspaceId) {
    //     setVoicesError("Please enter a Workspace ID");
    //     return;
    //   }

    //   setLoadingVoices(true);
    //   setVoicesError("");

    //   try {
    //     // Use proxy URL
    //     const url = `/api/voices/v1/workspaces/${workspaceId}/voices`;
        
    //     const response = await fetch(url, {
    //       method: "GET",
    //       headers: {
    //         "Authorization": getAuthHeader(),
    //         "Content-Type": "application/json",
    //       },
    //     });

    //     if (!response.ok) {
    //       if (response.status === 401) {
    //         throw new Error("Unauthorized - Check your JWT token or API key");
    //       }
    //       throw new Error(`Failed to fetch voices: ${response.status}`);
    //     }

    //     const data = await response.json();
    //     if (data.voices && Array.isArray(data.voices)) {
    //       setVoices(data.voices);
    //       // Auto-select first voice if none selected
    //       if (data.voices.length > 0 && !voiceId) {
    //         setVoiceId(data.voices[0].voiceId);
    //       }
    //     } else {
    //       setVoices([]);
    //       setVoicesError("No voices found in response");
    //     }
    //   } catch (error) {
    //     console.error("Error fetching voices:", error);
    //     setVoicesError(error instanceof Error ? error.message : "Failed to fetch voices");
    //   } finally {
    //     setLoadingVoices(false);
    //   }
    // }, [apiKey, jwtToken, workspaceId, useBasicAuth, getAuthHeader, voiceId]);

    // Get selected voice details
    const selectedVoice = voices.find(v => v.voiceId === voiceId);

    // Function to split text into chunks at the last period before 2000 chars
    // const splitTextIntoChunks = useCallback((text: string): string[] => {
    //   const chunks: string[] = [];
    //   let remainingText = text.trim();

    //   while (remainingText.length > 0) {
    //     if (remainingText.length <= MAX_CHARS) {
    //       chunks.push(remainingText);
    //       break;
    //     }

    //     // Find the last period before MAX_CHARS
    //     let cutIndex = MAX_CHARS;
    //     let lastPeriodIndex = remainingText.lastIndexOf(".", MAX_CHARS);

    //     // If no period found in the first 2000 chars, look for other punctuation
    //     if (lastPeriodIndex === -1 || lastPeriodIndex < MAX_CHARS * 0.5) {
    //       // Try finding other sentence boundaries
    //       const lastQuestion = remainingText.lastIndexOf("?", MAX_CHARS);
    //       const lastExclamation = remainingText.lastIndexOf("!", MAX_CHARS);
    //       const lastNewline = remainingText.lastIndexOf("\n", MAX_CHARS);

    //       lastPeriodIndex = Math.max(lastQuestion, lastExclamation, lastNewline);

    //       // If still no boundary found, look for space
    //       if (lastPeriodIndex === -1 || lastPeriodIndex < MAX_CHARS * 0.5) {
    //         const lastSpace = remainingText.lastIndexOf(" ", MAX_CHARS);
    //         if (lastSpace > MAX_CHARS * 0.5) {
    //           lastPeriodIndex = lastSpace;
    //         }
    //       }
    //     }

    //     if (lastPeriodIndex > 0) {
    //       cutIndex = lastPeriodIndex + 1; // Include the period
    //     }

    //     const chunk = remainingText.substring(0, cutIndex).trim();
    //     chunks.push(chunk);
    //     remainingText = remainingText.substring(cutIndex).trim();
    //   }

    //   return chunks;
    // }, []);
    const splitTextIntoChunks = useCallback((text: string): string[] => {
  const chunks: string[] = [];
  let remainingText = text.trim();
  const maxLen = 1950;

  while (remainingText.length > 0) {
    if (remainingText.length <= maxLen) {
      chunks.push(remainingText);
      break;
    }

    const searchArea = remainingText.substring(0, maxLen);
    let cutIndex = -1;

    // Try sentence boundaries (. ! ?)
    for (let i = searchArea.length - 1; i >= Math.floor(maxLen * 0.3); i--) {
      const char = searchArea[i];
      if (char === '.' || char === '!' || char === '?') {
        cutIndex = i + 1;
        break;
      }
    }

    // Try newline
    if (cutIndex === -1) {
      const lastNewline = searchArea.lastIndexOf('\n');
      if (lastNewline > Math.floor(maxLen * 0.3)) {
        cutIndex = lastNewline + 1;
      }
    }

    // Try comma/semicolon
    if (cutIndex === -1) {
      for (let i = searchArea.length - 1; i >= Math.floor(maxLen * 0.3); i--) {
        if (searchArea[i] === ',' || searchArea[i] === ';') {
          cutIndex = i + 1;
          break;
        }
      }
    }

    // Try space
    if (cutIndex === -1) {
      const lastSpace = searchArea.lastIndexOf(' ');
      if (lastSpace > Math.floor(maxLen * 0.3)) {
        cutIndex = lastSpace + 1;
      }
    }

    // Hard cut as last resort
    if (cutIndex <= 0) {
      cutIndex = maxLen;
    }

    const chunk = remainingText.substring(0, cutIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remainingText = remainingText.substring(cutIndex).trim();
  }

  return chunks.filter(chunk => chunk.length > 0);
}, []);
// ✅ Fetch voices — replace the fetchVoices function's fetch call
const fetchVoices = useCallback(async () => {
  setLoadingVoices(true);
  setVoicesError("");

  try {
    const response = await fetch('/api/voices');

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`);
    }

    const data = await response.json();
    if (data.voices && Array.isArray(data.voices)) {
      setVoices(data.voices);
      if (data.voices.length > 0 && !voiceId) {
        setVoiceId(data.voices[0].voiceId);
      }
    } else {
      setVoices([]);
      setVoicesError("No voices found in response");
    }
  } catch (error) {
    console.error("Error fetching voices:", error);
    setVoicesError(error instanceof Error ? error.message : "Failed to fetch voices");
  } finally {
    setLoadingVoices(false);
  }
}, [voiceId]);

// ✅ Process chunk — replace the processChunk function's fetch call
// const processChunk = async (chunkText: string): Promise<Blob> => {
//   const response = await fetch('/api/tts', {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       text: chunkText,
//       voice_id: voiceId,
//       audio_config: {
//         audio_encoding: "MP3",
//         speaking_rate: speakingRate,
//       },
//       temperature: temperature,
//       model_id: modelId,
//     }),
//     signal: abortControllerRef.current?.signal,
//   });

//   if (!response.ok) {
//     throw new Error(`HTTP error! status: ${response.status}`);
//   }

//   const result = await response.json();
//   const audioContent = result.audioContent;

//   if (!audioContent) {
//     throw new Error("No audio content received from API");
//   }

//   const byteCharacters = atob(audioContent);
//   const byteNumbers = new Array(byteCharacters.length);
//   for (let i = 0; i < byteCharacters.length; i++) {
//     byteNumbers[i] = byteCharacters.charCodeAt(i);
//   }
//   const byteArray = new Uint8Array(byteNumbers);
//   return new Blob([byteArray], { type: "audio/mpeg" });
// };
const processChunk = async (chunkText: string): Promise<Blob> => {
  const response = await fetch('http://localhost:3001/api/tts', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: chunkText,
      voiceId: voiceId,
      modelId: modelId,
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: speakingRate,
      },
      temperature: temperature,
    }),
    signal: abortControllerRef.current?.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const chunks = await response.json();

  // Extract all audio content from the array of chunks
  const allAudioContent = chunks
    .map((chunk: any) => chunk.result?.audioContent)
    .filter(Boolean);

  if (allAudioContent.length === 0) {
    throw new Error("No audio content received from API");
  }

  // Decode and concatenate all base64 audio chunks
  const binaryChunks = allAudioContent.map((b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  });

  const totalLength = binaryChunks.reduce(
    (sum: number, chunk: Uint8Array) => sum + chunk.length,
    0
  );
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of binaryChunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([combined], { type: "audio/mpeg" });
};
    // Function to process a single chunk
    // const processChunk = async (chunkText: string): Promise<Blob> => {
    //   const url = "/api/tts/v1/voice";
      
    //   const response = await fetch(url, {
    //     method: "POST",
    //     headers: {
    //       "Authorization": getAuthHeader(),
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({
    //       text: chunkText,
    //       voice_id: voiceId,
    //       audio_config: {
    //         audio_encoding: "MP3",
    //         speaking_rate: speakingRate,
    //       },
    //       temperature: temperature,
    //       model_id: modelId,
    //     }),
    //     signal: abortControllerRef.current?.signal,
    //   });

    //   if (!response.ok) {
    //     throw new Error(`HTTP error! status: ${response.status}`);
    //   }

    //   const result = await response.json();
    //   const audioContent = result.audioContent;

    //   if (!audioContent) {
    //     throw new Error("No audio content received from API");
    //   }

    //   // Convert base64 to blob
    //   const byteCharacters = atob(audioContent);
    //   const byteNumbers = new Array(byteCharacters.length);
    //   for (let i = 0; i < byteCharacters.length; i++) {
    //     byteNumbers[i] = byteCharacters.charCodeAt(i);
    //   }
    //   const byteArray = new Uint8Array(byteNumbers);
    //   return new Blob([byteArray], { type: "audio/mpeg" });
    // };


    // Main processing function
    const startProcessing = async () => {
      if (!inputText.trim()) return;

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Split text into chunks
      const textChunks = splitTextIntoChunks(inputText);
      const initialChunks: Chunk[] = textChunks.map((text, index) => ({
        id: index,
        text,
        status: "pending",
      }));

      setChunks(initialChunks);
      setIsProcessing(true);
      setCurrentChunkIndex(0);

      const completedBlobs: Blob[] = [];

      try {
        for (let i = 0; i < textChunks.length; i++) {
          // Update current chunk status to processing
          setChunks((prev) =>
            prev.map((chunk) =>
              chunk.id === i ? { ...chunk, status: "processing" } : chunk
            )
          );
          setCurrentChunkIndex(i);

          // Process the chunk
          const audioBlob = await processChunk(textChunks[i]);
          completedBlobs.push(audioBlob);

          // Update chunk status to completed with audio blob
          setChunks((prev) =>
            prev.map((chunk) =>
              chunk.id === i
                ? { ...chunk, status: "completed", audioBlob }
                : chunk
            )
          );

          // Small delay to prevent rate limiting
          if (i < textChunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // All chunks completed - offer combined download
        if (completedBlobs.length > 0) {
          await downloadCombinedAudio(completedBlobs);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Processing was cancelled");
        } else {
          console.error("Error processing chunks:", error);
          // Update the current chunk with error status
          setChunks((prev) =>
            prev.map((chunk) =>
              chunk.id === currentChunkIndex
                ? { ...chunk, status: "error", error: error instanceof Error ? error.message : "Unknown error" }
                : chunk
            )
          );
        }
      } finally {
        setIsProcessing(false);
        abortControllerRef.current = null;
      }
    };

    const stopProcessing = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };

    // Function to combine all MP3 blobs and download
    const downloadCombinedAudio = async (blobs: Blob[]) => {
      if (blobs.length === 0) return;

      const combinedBlob = new Blob(blobs, { type: "audio/mpeg" });
      const url = URL.createObjectURL(combinedBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tts_combined_${new Date().getTime()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Download individual chunk
    const downloadChunk = (chunk: Chunk) => {
      if (!chunk.audioBlob) return;

      const url = URL.createObjectURL(chunk.audioBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tts_chunk_${chunk.id + 1}_${new Date().getTime()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const completedCount = chunks.filter((c) => c.status === "completed").length;
    const progress = chunks.length > 0 ? (completedCount / chunks.length) * 100 : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-zinc-100 p-4 md:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">TTS Stream Processor</h1>
            <p className="mt-2 text-slate-600">
              Convert long texts to speech by processing 2000-character chunks sequentially
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Panel - Input & Settings */}
            <div className="space-y-4">
              {/* API Settings */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 font-semibold text-slate-800">API Configuration</h2>
                
                {/* Auth Method Toggle */}
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                  <button
                    onClick={() => setUseBasicAuth(false)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      !useBasicAuth
                        ? "bg-indigo-600 text-white"
                        : "text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    JWT Token (Recommended)
                  </button>
                  <button
                    onClick={() => setUseBasicAuth(true)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      useBasicAuth
                        ? "bg-indigo-600 text-white"
                        : "text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Basic Auth
                  </button>
                </div>

                <div className="space-y-3">
                  {/* JWT Token Input */}
                  {!useBasicAuth && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        JWT Token (Bearer)
                      </label>
                      <textarea
                        value={jwtToken}
                        onChange={(e) => setJwtToken(e.target.value)}
                        className="h-20 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Your backend should generate this JWT using your API Key and Secret
                      </p>
                    </div>
                  )}

                  {/* Basic Auth Input */}
                  {useBasicAuth && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        API Key (Basic Auth Base64)
                      </label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="Basic ZkNCbDZkUzVHRFZySUx0bjl..."
                      />
                    </div>
                  )}

                  {/* Workspace ID */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Workspace ID
                    </label>
                    <input
                      type="text"
                      value={workspaceId}
                      onChange={(e) => setWorkspaceId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="your-workspace-id"
                    />
                  </div>

                  {/* Load Voices Button */}
                  <div>
                    <button
                      onClick={fetchVoices}
                      disabled={loadingVoices}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {loadingVoices ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Loading Voices...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Load Cloned Voices
                        </>
                      )}
                    </button>
                  </div>
                  
                  {voicesError && (
                    <div className="rounded-md bg-red-50 p-2 text-xs text-red-600">
                      {voicesError}
                    </div>
                  )}

                  {/* Voice Selection */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Select Cloned Voice
                    </label>
                    
                    {voices.length > 0 ? (
                      <>
                        <select
                          value={voiceId}
                          onChange={(e) => setVoiceId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {voices.map((voice) => (
                            <option key={voice.voiceId} value={voice.voiceId}>
                              {voice.displayName}
                            </option>
                          ))}
                        </select>
                        
                        {selectedVoice && (
                          <div className="mt-2 rounded-md bg-slate-50 p-2">
                            <p className="text-xs text-slate-600">
                              <span className="font-medium">Description: </span>
                              {selectedVoice.description}
                            </p>
                            {selectedVoice.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {selectedVoice.tags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-500">
                        {loadingVoices ? "Loading voices..." : "Click 'Load Cloned Voices' to fetch your voices"}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Temperature ({temperature})
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Speaking Rate ({speakingRate}x)
                      </label>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={speakingRate}
                        onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Model ID
                    </label>
                    <select
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="inworld-tts-1.5-max">inworld-tts-1.5-max</option>
                      <option value="inworld-tts-1.5">inworld-tts-1.5</option>
                      <option value="inworld-tts-1">inworld-tts-1</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Text Input */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">Input Text</h2>
                  <span className="text-sm text-slate-500">
                    {inputText.length.toLocaleString()} characters
                  </span>
                </div>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your long text here (6-10 pages)... The text will be automatically split into 2000-character chunks at sentence boundaries."
                  className="h-64 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  disabled={isProcessing}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={startProcessing}
                    disabled={isProcessing || !inputText.trim()}
                    className={cn(
                      "flex-1 rounded-lg px-4 py-2 font-medium text-white transition-colors",
                      isProcessing || !inputText.trim()
                        ? "cursor-not-allowed bg-slate-400"
                        : "bg-indigo-600 hover:bg-indigo-700"
                    )}
                  >
                    {isProcessing ? "Processing..." : "Start TTS Conversion"}
                  </button>
                  {isProcessing && (
                    <button
                      onClick={stopProcessing}
                      className="rounded-lg bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600"
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Progress & Chunks */}
            <div className="space-y-4">
              {/* Progress Bar */}
              {chunks.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-800">Progress</h2>
                    <span className="text-sm font-medium text-indigo-600">
                      {completedCount} / {chunks.length} chunks completed
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {isProcessing
                      ? `Processing chunk ${currentChunkIndex + 1} of ${chunks.length}...`
                      : completedCount === chunks.length && chunks.length > 0
                      ? "All chunks completed! Combined audio downloaded automatically."
                      : "Ready to process"}
                  </p>
                </div>
              )}

              {/* Chunks List */}
              {chunks.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 font-semibold text-slate-800">Chunks ({chunks.length})</h2>
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
                    {chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className={cn(
                          "rounded-lg border p-3 transition-colors",
                          chunk.status === "completed"
                            ? "border-green-200 bg-green-50"
                            : chunk.status === "processing"
                            ? "border-indigo-200 bg-indigo-50"
                            : chunk.status === "error"
                            ? "border-red-200 bg-red-50"
                            : "border-slate-200 bg-slate-50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                                chunk.status === "completed"
                                  ? "bg-green-500 text-white"
                                  : chunk.status === "processing"
                                  ? "bg-indigo-500 text-white"
                                  : chunk.status === "error"
                                  ? "bg-red-500 text-white"
                                  : "bg-slate-300 text-slate-600"
                              )}
                            >
                              {chunk.id + 1}
                            </span>
                            <span className="text-sm font-medium text-slate-700">
                              {chunk.status === "pending" && "Pending"}
                              {chunk.status === "processing" && "Processing..."}
                              {chunk.status === "completed" && "Completed"}
                              {chunk.status === "error" && "Error"}
                            </span>
                          </div>
                          {chunk.audioBlob && (
                            <button
                              onClick={() => downloadChunk(chunk)}
                              className="flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-200"
                            >
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                              </svg>
                              Download
                            </button>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                          {chunk.text.substring(0, 100)}...
                        </p>
                        {chunk.error && (
                          <p className="mt-1 text-xs text-red-600">{chunk.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {!chunks.length && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-3 font-semibold text-slate-800">How it works</h2>
                  <ol className="list-inside list-decimal space-y-2 text-sm text-slate-600">
                    <li>Paste your long text (6-10 pages) in the input area</li>
                    <li>Enter your JWT token (from your backend) or use Basic Auth</li>
                    <li>Enter your Workspace ID and click "Load Cloned Voices"</li>
                    <li>Select your cloned voice from the dropdown</li>
                    <li>Click "Start TTS Conversion"</li>
                    <li>The app will automatically:
                      <ul className="ml-5 mt-1 list-inside list-disc text-slate-500">
                        <li>Split text into ~2000 character chunks at sentence boundaries</li>
                        <li>Send each chunk to the API and wait for response</li>
                        <li>Save the MP3 and process the next chunk</li>
                        <li>Combine all audio files into one downloadable MP3</li>
                      </ul>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
