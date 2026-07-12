// src/lib/voiceNotes.js
// Voice Notes feature — record, upload, and send audio messages
// Complements existing AudioPlayer component in MessageThread.jsx

import { sendMediaMessage } from './channels.js';

const AUDIO_MIME_CANDIDATES = [
  'audio/ogg;codecs=opus',  // Highest priority: WhatsApp-native format
  'audio/mp4',               // Fallback: Safari/iOS
  'audio/webm;codecs=opus',  // Last resort: browser fallback
];

export function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const mt of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return '';
}

function extForMime(mime) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

export class VoiceRecorder {
  constructor(onRecordingStarted, onRecordingStopped) {
    this.mediaRecorder = null;
    this.audioStream = null;
    this.chunks = [];
    this.mimeType = pickRecorderMimeType();
    this.onRecordingStarted = onRecordingStarted;
    this.onRecordingStopped = onRecordingStopped;
    this.isRecording = false;
  }

  async start() {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType: this.mimeType || undefined });
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.isRecording = false;
        this.onRecordingStopped?.(blob);
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.onRecordingStarted?.();
    } catch (e) {
      console.error('[VoiceRecorder] start error:', e);
      throw new Error('Microphone access denied');
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.audioStream?.getTracks().forEach(t => t.stop());
    }
  }

  getExtension() {
    return extForMime(this.mimeType);
  }
}

// Send a recorded voice note as a media message
export async function sendVoiceNote(workspaceId, conversationId, audioBlob, senderName, senderId = null, replyTo = null) {
  const ext = pickRecorderMimeType().includes('ogg') ? 'ogg' : 
              pickRecorderMimeType().includes('mp4') ? 'm4a' : 'webm';
  const file = new File([audioBlob], `voice-${Date.now()}.${ext}`, { type: audioBlob.type });
  return sendMediaMessage(workspaceId, conversationId, file, 'audio', senderName, '', senderId, replyTo);
}
