import { useState, useRef, useCallback } from "react";

interface RecorderState {
  isRecording: boolean;
  recordedChunks: BlobPart[];
  stream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
  error: string | null;
  isMirrored: boolean;
}

export const useVideoRecorder = () => {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    recordedChunks: [],
    stream: null,
    mediaRecorder: null,
    error: null,
    isMirrored: false,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8,opus",
      });

      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.start();

      setState({
        isRecording: true,
        recordedChunks: chunks,
        stream,
        mediaRecorder,
        error: null,
        isMirrored: false,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setState((prev) => ({ ...prev, error: errorMsg }));
    }
  }, []);

  const stopRecording = useCallback(
    async (): Promise<Blob | null> => {
      return new Promise((resolve) => {
        if (!state.mediaRecorder) {
          resolve(null);
          return;
        }

        state.mediaRecorder.onstop = () => {
          const blob = new Blob(state.recordedChunks, { type: "video/webm" });

          // Stop all streams
          state.stream?.getTracks().forEach((track) => track.stop());

          setState({
            isRecording: false,
            recordedChunks: [],
            stream: null,
            mediaRecorder: null,
            error: null,
            isMirrored: false,
          });

          resolve(blob);
        };

        state.mediaRecorder.stop();
      });
    },
    [state.mediaRecorder, state.recordedChunks, state.stream]
  );

  const cancelRecording = useCallback(() => {
    if (state.mediaRecorder) {
      state.mediaRecorder.stop();
    }

    state.stream?.getTracks().forEach((track) => track.stop());

    setState({
      isRecording: false,
      recordedChunks: [],
      stream: null,
      mediaRecorder: null,
      error: null,
      isMirrored: false,
    });
  }, [state.mediaRecorder, state.stream]);


  const getPreviewUrl = useCallback(() => {
    if (state.stream) {
      return URL.createObjectURL(state.stream as any);
    }
    return null;
  }, [state.stream]);

  const toggleMirror = useCallback(() => {
    setState((prev) => ({ ...prev, isMirrored: !prev.isMirrored }));
  }, []);

  return {
    isRecording: state.isRecording,
    error: state.error,
    startRecording,
    stopRecording,
    cancelRecording,
    getPreviewUrl,
    canvasRef,
    stream: state.stream,
    isMirrored: state.isMirrored,
    toggleMirror,
  };
};
