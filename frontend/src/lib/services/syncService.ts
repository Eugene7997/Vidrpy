import { toast } from "react-toastify";
import { videoAPI } from "@lib/apis/videoApi";
import { authAPI } from "@lib/apis/authApi";
import type { Video, VideoCreate } from "@lib/types/video";
import {
  getLocalVideos,
  getLocalVideo,
  saveVideo,
  deleteVideo,
  addPendingOperation,
  getPendingOperations,
  removePendingOperation,
  saveUploadProgress,
  deleteUploadProgress,
  type PendingOperation,
} from "@lib/db/storage";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const SYNC_INTERVAL_MS = 30000; // 30 seconds

type SyncListener = () => void;

class SyncService {
  private listeners = new Set<SyncListener>();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  async createVideoLocally(videoData: VideoCreate, blob: Blob): Promise<Video> {
    const user = authAPI.getUser();
    if (!user) throw new Error("User not authenticated");

    const video: Video = {
      video_id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      user_id: user.user_id,
      filename: videoData.filename,
      indexeddb_key: videoData.indexeddb_key,
      cloud_path: undefined,
      upload_status_private: "success",
      upload_status_cloud: "pending",
      retry_count_private: 0,
      retry_count_cloud: 0,
      size_bytes: videoData.size_bytes || blob.size,
      duration_ms: videoData.duration_ms,
      created_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
    };

    await saveVideo(video, blob);

    // Queue for upload
    await addPendingOperation({
      type: "upload",
      userId: user.user_id,
      videoId: video.video_id,
      data: { filename: videoData.filename },
      createdAt: Date.now(),
    });

    this.notify();

    // Trigger automatic sync to server after a small delay to ensure everything is saved after recording
    console.log("Triggering sync after recording...");
    setTimeout(() => {
      this.sync().catch(err => {
        console.log("Sync failed:", err.message);
      });
    }, 500);

    return video;
  }

  async renameVideoLocally(videoId: string, newFilename: string): Promise<void> {
    const video = await getLocalVideo(videoId);
    if (!video) throw new Error("Video not found");

    // Update locally
    video.video.filename = newFilename;
    video.video.last_modified = new Date().toISOString();
    await saveVideo(video.video, video.blob);

    // Queue for server sync (only if already uploaded)
    if (video.video.cloud_path) {
      // Remove any existing rename operations for this video to avoid duplicates
      const user = authAPI.getUser();
      const existingOps = await getPendingOperations(user?.user_id);
      for (const op of existingOps) {
        if (op.type === "rename" && op.videoId === videoId) {
          await removePendingOperation(op.id);
          console.log(`Removed duplicate rename operation for ${videoId}`);
        }
      }

      const opId = await addPendingOperation({
        type: "rename",
        userId: user?.user_id,
        videoId,
        data: { newFilename },
        createdAt: Date.now(),
      });
      console.log(`Queued rename operation ${opId} for video ${videoId}: "${newFilename}"`);
    } else {
      console.log(`Skipped queueing rename for ${videoId} - no cloud_path (not synced yet)`);
    }

    this.notify();
  }

  async deleteVideoLocally(videoId: string): Promise<void> {
    const video = await getLocalVideo(videoId);

    console.log(`Delete operation for ${videoId}:`, {
      hasVideo: !!video,
      hasCloudPath: !!video?.video.cloud_path,
      cloudPath: video?.video.cloud_path
    });

    // Remove any pending operations for this video (upload, rename, etc.)
    // This is important for videos that haven't been uploaded yet
    const user = authAPI.getUser();
    const pendingOps = await getPendingOperations(user?.user_id);
    const videoOps = pendingOps.filter(op => op.videoId === videoId);
    
    if (videoOps.length > 0) {
      console.log(`Removing ${videoOps.length} pending operation(s) for video ${videoId}`);
      for (const op of videoOps) {
        await removePendingOperation(op.id);
        console.log(`Removed pending operation ${op.id} (type: ${op.type})`);
      }
    }

    // Clean up upload progress if it exists
    try {
      await deleteUploadProgress(videoId);
      console.log(`Cleaned up upload progress for video ${videoId}`);
    } catch (err) {
      console.log(`No upload progress to clean up for video ${videoId}`);
    }

    // Delete locally immediately
    await deleteVideo(videoId);

    // Queue for server sync (only if already uploaded)
    if (video?.video.cloud_path) {
      const opId = await addPendingOperation({
        type: "delete",
        userId: user?.user_id,
        videoId,
        data: {},
        createdAt: Date.now(),
      });
      console.log(`Queued delete operation ${opId} for video ${videoId}`);
    } else {
      console.log(`Skipped queueing delete for ${videoId} - no cloud_path (not synced yet)`);
    }

    this.notify();
  }

  async getAllVideos(includeServerVideos: boolean = true): Promise<Video[]> {
    const user = authAPI.getUser();
    if (!user) {
      console.warn("getAllVideos called without authenticated user");
      return [];
    }

    const localVideos = await getLocalVideos(user.user_id);

    if (!includeServerVideos || !(await this.isOnline())) {
      return localVideos;
    }

    try {
      const serverVideos = await videoAPI.getVideos();
      console.log(`Server videos: ${serverVideos.length}`);

      // Get pending operations to check for pending deletes
      const pendingOps = await getPendingOperations(user.user_id);
      const pendingDeleteIds = new Set(
        pendingOps.filter(op => op.type === "delete").map(op => op.videoId)
      );

      // Smart merge: compare timestamps and update local if server is newer
      const videoMap = new Map<string, Video>();

      // First, add all server videos
      serverVideos.forEach(v => videoMap.set(v.video_id, v));

      // Download videos that exist on server but not locally
      for (const serverVideo of serverVideos) {
        const localVideo = localVideos.find(v => v.video_id === serverVideo.video_id);
        if (!localVideo) {
          // Check if there's a pending delete operation for this video
          if (pendingDeleteIds.has(serverVideo.video_id)) {
            console.log(`Skipping download of ${serverVideo.filename} (${serverVideo.video_id.substring(0, 20)}...) - pending delete operation`);
            continue;
          }

          // If video exists on server but not locally then we download it
          console.log(`Downloading missing video: ${serverVideo.filename} (${serverVideo.video_id.substring(0, 20)}...)`);
          let downloadedBlob: Blob | undefined;
          if (serverVideo.cloud_path) {
            try {
              downloadedBlob = await videoAPI.downloadVideoBlob(serverVideo.cloud_path);
              console.log(`Downloaded blob (${(downloadedBlob.size / 1024 / 1024).toFixed(2)} MB)`);
            } catch (downloadErr) {
              console.warn(`Failed to download blob:`, downloadErr);
            }
          }

          // Before saving server video, check if a matching local-only video exists
          // (same filename + size + duration). If so, merge by reusing the local
          // blob and replacing the local record with the server-backed record.
          const matchingLocal = localVideos.find(l =>
            l.filename === serverVideo.filename &&
            (l.size_bytes ?? 0) === (serverVideo.size_bytes ?? 0) &&
            (l.duration_ms ?? 0) === (serverVideo.duration_ms ?? 0)
          );

          if (matchingLocal) {
            console.log(`Found matching local video for server record ${serverVideo.video_id}: merging ${matchingLocal.video_id} -> ${serverVideo.video_id}`);

            // Prefer existing local blob if available
            const localStored = await getLocalVideo(matchingLocal.video_id);
            const blobToSave = localStored?.blob || downloadedBlob;

            // Remove the old local record and any pending upload op for it
            try {
              await deleteVideo(matchingLocal.video_id);
              const existingOps = await getPendingOperations(user.user_id);
              for (const op of existingOps) {
                if (op.type === "upload" && op.videoId === matchingLocal.video_id) {
                  await removePendingOperation(op.id);
                  console.log(`Removed pending upload op ${op.id} for ${matchingLocal.video_id}`);
                }
              }
            } catch (err) {
              console.warn(`Failed to remove old local record or pending ops for ${matchingLocal.video_id}:`, err);
            }

            // Save server record re-using the blob
            await saveVideo(serverVideo, blobToSave);
            console.log(`Merged and saved server video to local storage`);
          } else {
            // No matching local video, save server record as-is
            await saveVideo(serverVideo, downloadedBlob);
            console.log(`Saved video to local storage`);
          }
        }
      }

      // Track if we queued any operations to notify at the end
      let queuedOperations = false;

      // Then process local videos
      for (const localVideo of localVideos) {
        const serverVideo = videoMap.get(localVideo.video_id);

        if (!serverVideo) {
          // Video only exists locally (not uploaded yet, or was deleted from server)
          // But check if there's a pending delete operation. If so, don't include it
          if (pendingDeleteIds.has(localVideo.video_id)) {
            console.log(`Skipping local-only video ${localVideo.filename} (${localVideo.video_id.substring(0, 20)}...) - pending delete operation`);
            continue;
          }

          // If local video has cloud_path but doesn't exist on server, update status to local and queue for re-upload
          if (localVideo.cloud_path && localVideo.upload_status_cloud === "success") {
            console.log(`Video ${localVideo.filename} (${localVideo.video_id.substring(0, 20)}...) was synced but no longer on server - updating to local status and queueing for re-upload`);
            localVideo.cloud_path = undefined;
            localVideo.upload_status_cloud = "pending";
            localVideo.last_modified = new Date().toISOString();
            // Update local storage
            const localStored = await getLocalVideo(localVideo.video_id);
            if (localStored) {
              await saveVideo(localVideo, localStored.blob);
              console.log(`Updated video ${localVideo.video_id} status to local-only`);

              // Queue for re-upload (check if upload operation already exists first)
              const existingOps = await getPendingOperations(user.user_id);
              const hasUploadOp = existingOps.some(op => op.type === "upload" && op.videoId === localVideo.video_id);
              if (!hasUploadOp) {
                const opId = await addPendingOperation({
                  type: "upload",
                  userId: user.user_id,
                  videoId: localVideo.video_id,
                  data: { filename: localVideo.filename },
                  createdAt: Date.now(),
                });
                console.log(`Queued re-upload operation ${opId} for video ${localVideo.video_id}`);
                queuedOperations = true;
              } else {
                console.log(`Upload operation already queued for video ${localVideo.video_id}`);
              }
            }
          }

          console.log(`Local-only video: ${localVideo.filename} (${localVideo.video_id.substring(0, 20)}...)`);
          videoMap.set(localVideo.video_id, localVideo);
        } else {
          // Check if there's a pending delete operation for this video
          if (pendingDeleteIds.has(localVideo.video_id)) {
            console.log(`Skipping merge of ${localVideo.filename} (${localVideo.video_id.substring(0, 20)}...) - pending delete operation`);
            // Remove from map since it's being deleted
            videoMap.delete(localVideo.video_id);
            continue;
          }

          // Video exists both locally and on server - compare timestamps
          const localModified = new Date(localVideo.last_modified).getTime();
          const serverModified = new Date(serverVideo.last_modified).getTime();

          console.log(`Comparing ${localVideo.filename}:`);
          console.log(`     Local:  ${localVideo.last_modified} (${localModified})`);
          console.log(`     Server: ${serverVideo.last_modified} (${serverModified})`);

          if (serverModified > localModified) {
            // Server version is newer - download blob and update local storage
            console.log(`Server version is NEWER, downloading and updating local storage`);
            console.log(`     Old filename: "${localVideo.filename}"`);
            console.log(`     New filename: "${serverVideo.filename}"`);

            let downloadedBlob: Blob | undefined;

            // Download the blob from server if cloud_path exists
            if (serverVideo.cloud_path) {
              try {
                console.log(`Downloading video blob from: ${serverVideo.cloud_path.substring(0, 50)}...`);
                downloadedBlob = await videoAPI.downloadVideoBlob(serverVideo.cloud_path);
                console.log(`Downloaded blob (${(downloadedBlob.size / 1024 / 1024).toFixed(2)} MB)`);
              } catch (downloadErr) {
                console.warn(`Failed to download blob, keeping existing local blob if available:`, downloadErr);
                // If download fails, try to keep existing local blob
                const localStored = await getLocalVideo(localVideo.video_id);
                downloadedBlob = localStored?.blob;
              }
            } else {
              // No cloud_path, try to keep existing local blob
              const localStored = await getLocalVideo(localVideo.video_id);
              downloadedBlob = localStored?.blob;
            }

            // Update local storage with server metadata and downloaded/blob
            await saveVideo(serverVideo, downloadedBlob);
            console.log(`Local storage updated with server metadata and blob`);

            // Use server version in the returned list
            videoMap.set(localVideo.video_id, serverVideo);
          } else if (localModified > serverModified) {
            console.log(`Local version is NEWER (has pending changes)`);
            // Local version is newer - keep local (has blob)
            videoMap.set(localVideo.video_id, localVideo);
          } else {
            console.log(`Versions are SAME`);
            // Same timestamp - prefer local (has blob)
            videoMap.set(localVideo.video_id, localVideo);
          }
        }
      }

      // Notify listeners if we queued any operations
      if (queuedOperations) {
        console.log(`Notifying listeners after queueing operations`);
        this.notify();
      }

      return Array.from(videoMap.values());
    } catch (err) {
      console.warn("Server unreachable, using local videos only");
      return localVideos;
    }
  }

  async sync(): Promise<void> {
    console.log("sync() called");

    if (this.isSyncing) {
      console.log("Sync already in progress, skipping...");
      return;
    }

    const user = authAPI.getUser();
    if (!user) {
      console.log("No user authenticated, skipping sync");
      return;
    }

    const online = await this.isOnline();
    console.log(`Backend online check: ${online}`);

    if (!online) {
      console.log("Backend offline, skipping sync");
      throw new Error("Backend is offline");
    }

    this.isSyncing = true;
    console.log("Sync lock acquired");

    try {
      const operations = await getPendingOperations(user.user_id);
      console.log(`Found ${operations.length} pending operation(s)`);

      if (operations.length === 0) {
        console.log("No pending operations to sync");
        return;
      }

      console.log(`Starting sync of ${operations.length} operation(s)...`);

      let successCount = 0;
      let failCount = 0;

      for (const op of operations) {
        try {
          console.log(`Processing ${op.type} operation: ${op.id.substring(0, 30)}...`);
          await this.processOperation(op);
          await removePendingOperation(op.id);
          console.log(`Completed ${op.type} operation`);
          successCount++;
        } catch (err) {
          console.error(`Failed to process ${op.type} operation:`, err);
          failCount++;
          // Keep in queue for next sync
        }
      }

      console.log(`Sync completed: ${successCount} succeeded, ${failCount} failed`);
      this.notify();
    } catch (err) {
      console.error("Sync error:", err);
      throw err;
    } finally {
      this.isSyncing = false;
      console.log("Sync lock released");
    }
  }


  private async processOperation(op: PendingOperation): Promise<void> {
    switch (op.type) {
      case "upload": {
        const local = await getLocalVideo(op.videoId);
        if (!local?.blob) throw new Error("Video blob not found");

        // Check file size before attempting upload (Supabase limit is 50MB)
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
        if (local.blob.size > MAX_FILE_SIZE) {
          const sizeMB = (local.blob.size / 1024 / 1024).toFixed(2);
          const errorMsg = `File too large (${sizeMB}MB). Maximum size is 50MB.`;
          console.error(`Upload failed: ${errorMsg}`);

          toast.error(`Upload failed: ${errorMsg}`, {
            autoClose: 10000
          });

          // Mark as failed locally
          local.video.upload_status_cloud = "failed";
          await saveVideo(local.video, local.blob);

          throw new Error(errorMsg);
        }

        let serverVideoId: string | null = null;

        try {
          local.video.upload_status_cloud = "uploading";
          await saveVideo(local.video, local.blob);
          this.notify();

          // Create video record on server
          const serverVideo = await videoAPI.createVideo({
            filename: local.video.filename,
            size_bytes: local.video.size_bytes,
            duration_ms: local.video.duration_ms,
          });

          serverVideoId = serverVideo.video_id;

          console.log(`Server video created:`, {
            video_id: serverVideo.video_id,
            cloud_path: serverVideo.cloud_path || "(none yet)"
          });

          await videoAPI.uploadVideoFile(
            serverVideo.video_id,
            local.blob,
            local.video.filename,
            (progress) => {
              // Save progress to IndexedDB
              saveUploadProgress({
                videoId: op.videoId, // Use local video ID for tracking
                loaded: progress.loaded,
                total: progress.total,
                percentage: progress.percentage,
                updatedAt: Date.now(),
              }).catch(err => {
                console.warn("Failed to save upload progress:", err);
              });
              this.notify();
            }
          );

          console.log(`Video file uploaded, fetching updated record...`);

          // IMPORTANT: Fetch the video again from server to get the cloud_path
          // The cloud_path is only set after the upload completes
          const finalVideo = await videoAPI.getVideo(serverVideo.video_id);

          if (!finalVideo.cloud_path) {
            throw new Error(`Upload succeeded but no cloud_path returned from server`);
          }

          console.log(`Final video from server:`, {
            video_id: finalVideo.video_id,
            cloud_path: finalVideo.cloud_path,
            upload_status_cloud: finalVideo.upload_status_cloud
          });

          // Delete old local record (with local_xxx ID)
          await deleteVideo(op.videoId);

          // Clean up upload progress
          await deleteUploadProgress(op.videoId);

          // Create new record with server ID and cloud path from server
          const updatedVideo: Video = {
            ...local.video,
            video_id: finalVideo.video_id,
            cloud_path: finalVideo.cloud_path,
            upload_status_cloud: "success",
            upload_status_private: "success",
            last_modified: finalVideo.last_modified,
          };
          await saveVideo(updatedVideo, local.blob);

          console.log(`Video migrated successfully: ${op.videoId} -> ${finalVideo.video_id}`);
          console.log(`   cloud_path: ${finalVideo.cloud_path}`);

        } catch (uploadError) {
          // Upload failed - clean up the orphaned server record if it was created
          if (serverVideoId) {
            console.log(`Cleaning up failed upload - deleting server record ${serverVideoId}`);
            try {
              await videoAPI.deleteVideo(serverVideoId);
              console.log(`Orphaned server record deleted`);
            } catch (deleteError) {
              console.error(`Failed to delete orphaned server record:`, deleteError);
            }
          }

          // Mark local video as failed
          local.video.upload_status_cloud = "failed";
          await saveVideo(local.video, local.blob);

          // Clean up upload progress on failure
          await deleteUploadProgress(op.videoId);

          const errorMsg = uploadError instanceof Error ? uploadError.message : "Upload failed";
          // Don't show twice if size error
          if (!errorMsg.includes("File too large")) {
            toast.error(`Upload failed: ${errorMsg}`, {
              autoClose: 8000
            });
          }

          throw uploadError; // Re-throw to keep in queue
        }
        break;
      }

      case "rename": {
        console.log(`Syncing rename operation: ${op.videoId} -> ${op.data.newFilename}`);
        await videoAPI.renameVideo(op.videoId, op.data.newFilename);

        // Update local record too (in case it was queued before server sync)
        const local = await getLocalVideo(op.videoId);
        if (local) {
          local.video.filename = op.data.newFilename;
          local.video.last_modified = new Date().toISOString();
          await saveVideo(local.video, local.blob);
        }

        console.log(`Rename synced to server: ${op.videoId}`);
        break;
      }

      case "delete": {
        try {
          await videoAPI.deleteVideo(op.videoId);
          console.log(`Deleted video ${op.videoId} from server`);

          // Safety check: ensure video is also deleted locally (in case it was re-downloaded somehow)
          const localVideo = await getLocalVideo(op.videoId);
          if (localVideo) {
            console.log(`Cleaning up local video ${op.videoId} after successful server delete`);
            await deleteVideo(op.videoId);
          }
        } catch (err: any) {
          // Treat 404 as success (already deleted)
          if (err?.message?.includes("404") || err?.message?.includes("Not Found")) {
            console.log(`Video ${op.videoId} already deleted on server (404)`);
            // Still clean up locally if it exists
            const localVideo = await getLocalVideo(op.videoId);
            if (localVideo) {
              console.log(`Cleaning up local video ${op.videoId} after 404 (already deleted on server)`);
              await deleteVideo(op.videoId);
            }
            return;
          }
          console.error(`Failed to delete video ${op.videoId}:`, err);
          throw err;
        }
        break;
      }
    }
  }

  // Not using for now. Too complicated.
  startAutoSync() {
    if (this.syncInterval) {
      console.log("Auto-sync already running");
      return;
    }

    console.log("Starting auto-sync service (will sync every 30s)");

    // Initial sync after 5 seconds
    setTimeout(() => {
      console.log("Running initial sync...");
      this.sync();
    }, 5000);

    // Periodic sync
    this.syncInterval = setInterval(() => {
      console.log("Running periodic sync...");
      this.sync();
    }, SYNC_INTERVAL_MS);

    console.log("Auto-sync service started");
  }

  // Not using for now. Too complicated.
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${BACKEND_URL}/api/v1/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getPendingCount(): Promise<number> {
    const user = authAPI.getUser();
    if (!user) return 0;
    const ops = await getPendingOperations(user.user_id);
    return ops.length;
  }
}

export const syncService = new SyncService();

