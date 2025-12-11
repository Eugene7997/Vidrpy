import type { Video, VideoCreate, UploadProgress } from "@lib/types/video";
import { authAPI } from "./authApi";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

class VideoAPI {
  private baseUrl = `${API_BASE_URL}/api/v1/videos`;

  async getVideos(): Promise<Video[]> {
    const response = await fetch(`${this.baseUrl}/`, {
      headers: authAPI.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch videos: ${response.statusText}`);
    }
    return response.json();
  }

  async getVideo(videoId: string): Promise<Video> {
    const response = await fetch(`${this.baseUrl}/${videoId}`, {
      headers: authAPI.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }
    return response.json();
  }

  async createVideo(videoData: VideoCreate): Promise<Video> {
    const response = await fetch(`${this.baseUrl}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authAPI.getAuthHeaders(),
      },
      body: JSON.stringify(videoData),
    });
    if (!response.ok) {
      throw new Error(`Failed to create video: ${response.statusText}`);
    }
    return response.json();
  }

  async uploadVideoFile(
    videoId: string,
    file: Blob,
    filename: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    const formData = new FormData();
    formData.append("file", file, filename);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            onProgress({
              videoId,
              loaded: event.loaded,
              total: event.total,
              percentage: Math.round((event.loaded / event.total) * 100),
            });
          }
        });
      }

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload error"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload aborted"));
      });

      xhr.open("POST", `${this.baseUrl}/${videoId}/upload`);
      // Add auth header
      const token = authAPI.getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  }

  async deleteVideo(videoId: string, timeoutMs: number = 30000): Promise<void> {
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/${videoId}`, {
        method: "DELETE",
        headers: authAPI.getAuthHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      // 404 means video already deleted - this is idempotent success
      if (response.status === 404) {
        console.log(`Video ${videoId} already deleted on server (404)`);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to delete video: ${response.status} ${response.statusText}`);
      }
      
      try {
        const result = await response.json();
        console.log(`Delete operation completed for video ${videoId}:`, result);
      } catch {
        console.log(`Delete operation completed for video ${videoId} (status: ${response.status})`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Delete request timed out after ${timeoutMs}ms`);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  async renameVideo(videoId: string, newFilename: string): Promise<Video> {
    const response = await fetch(`${this.baseUrl}/${videoId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authAPI.getAuthHeaders(),
      },
      body: JSON.stringify({ filename: newFilename }),
    });
    if (!response.ok) {
      throw new Error(`Failed to rename video: ${response.statusText}`);
    }
    return response.json();
  }

  async downloadVideoBlob(cloudPath: string): Promise<Blob> {
    const response = await fetch(cloudPath);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    return response.blob();
  }
}

export const videoAPI = new VideoAPI();
