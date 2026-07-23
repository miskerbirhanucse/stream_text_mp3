import { FormEvent, useState } from "react";

export interface ClonedVoice {
  voiceId: string;
  displayName: string;
  description?: string;
  tags?: string[];
  langCode?: string;
  promptLanguages?: string[];
  source?: string;
}

interface CloneVoicePanelProps {
  onCreated: (voice: ClonedVoice) => void;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024;

const languages = [
  { value: "EN_US", label: "English — United States" },
  { value: "ES_ES", label: "Spanish — Spain" },
  { value: "FR_FR", label: "French — France" },
  { value: "DE_DE", label: "German — Germany" },
  { value: "IT_IT", label: "Italian — Italy" },
  { value: "PT_BR", label: "Portuguese — Brazil" },
  { value: "ZH_CN", label: "Chinese — Mandarin" },
  { value: "JA_JP", label: "Japanese" },
  { value: "KO_KR", label: "Korean" },
  { value: "AR_SA", label: "Arabic" },
  { value: "HI_IN", label: "Hindi" },
  { value: "AUTO", label: "Other / Auto detect" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Could not read the selected audio file"));
        return;
      }

      resolve(result.split(",")[1] || result);
    };

    reader.onerror = () => {
      reject(new Error("Could not read the selected audio file"));
    };

    reader.readAsDataURL(file);
  });
}

export function CloneVoicePanel({ onCreated }: CloneVoicePanelProps) {
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [langCode, setLangCode] = useState("EN_US");
  const [transcription, setTranscription] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [removeBackgroundNoise, setRemoveBackgroundNoise] = useState(true);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);

  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!displayName.trim()) {
      setError("Enter a name for the cloned voice.");
      return;
    }

    if (!audioFile) {
      setError("Select an audio sample.");
      return;
    }

    const extension = audioFile.name.split(".").pop()?.toLowerCase();

    if (!extension || !["wav", "mp3", "webm"].includes(extension)) {
      setError("Select a WAV, MP3, or WebM audio file.");
      return;
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      setError("The audio file must be 4 MB or smaller.");
      return;
    }

    if (!permissionConfirmed) {
      setError("Confirm that you own the voice or have explicit permission.");
      return;
    }

    setIsCloning(true);

    try {
      const audioData = await fileToBase64(audioFile);

      const response = await fetch("/api/voices/clone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          description: description.trim(),
          langCode,
          transcription: transcription.trim(),
          audioData,
          fileName: audioFile.name,
          removeBackgroundNoise,
          permissionConfirmed,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const upstreamMessage =
          typeof data.details === "string"
            ? data.details
            : data.details?.message;

        throw new Error(
          upstreamMessage ||
            data.error ||
            `Voice cloning failed: ${response.status}`,
        );
      }

      if (!data.voice?.voiceId) {
        throw new Error("Inworld did not return a voice ID.");
      }

      onCreated(data.voice);

      setSuccess(`"${data.voice.displayName}" was cloned and selected.`);

      setDisplayName("");
      setDescription("");
      setTranscription("");
      setAudioFile(null);
      setPermissionConfirmed(false);
    } catch (cloneError) {
      setError(
        cloneError instanceof Error
          ? cloneError.message
          : "Voice cloning failed",
      );
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-4">
        <h2 className="font-semibold text-slate-800">Create Cloned Voice</h2>

        <p className="mt-1 text-xs text-slate-500">
          Upload a clean 10–15 second recording without music or sound effects.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Voice name
          </label>

          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="My narrator voice"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Language
          </label>

          <select
            value={langCode}
            onChange={(event) => setLangCode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {languages.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Audio sample
          </label>

          <input
            type="file"
            accept=".wav,.mp3,.webm,audio/wav,audio/mpeg,audio/webm"
            onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
            className="block w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-600"
          />

          <p className="mt-1 text-xs text-slate-500">
            WAV, MP3 or WebM. Maximum 4 MB.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Exact words spoken
          </label>

          <textarea
            value={transcription}
            onChange={(event) => setTranscription(event.target.value)}
            placeholder="Write exactly what is being said in the recording."
            className="h-20 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <p className="mt-1 text-xs text-slate-500">
            Optional, but improves cloning quality.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>

          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Warm, energetic narration voice"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={removeBackgroundNoise}
            onChange={(event) => setRemoveBackgroundNoise(event.target.checked)}
            className="mt-1"
          />
          Remove background noise
        </label>

        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={permissionConfirmed}
            onChange={(event) => setPermissionConfirmed(event.target.checked)}
            className="mt-1"
          />
          I confirm that this is my voice or I have explicit permission from the
          voice owner to clone and use it.
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={isCloning}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isCloning ? "Creating Voice…" : "Clone Voice"}
        </button>
      </div>
    </form>
  );
}
