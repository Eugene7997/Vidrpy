export type UploadStatus = "pending" | "uploading" | "success" | "failed";

export interface Video {
  video_id: string;
  filename: string;
  indexeddb_key?: string;
  cloud_path?: string;
  upload_status_private: UploadStatus;
  upload_status_cloud: UploadStatus;
  retry_count_private: number;
  retry_count_cloud: number;
  size_bytes?: number;
  duration_ms?: number;
  created_at: string;
  last_modified: string;
}

export interface VideoCreate {
  filename: string;
  indexeddb_key?: string;
  cloud_path?: string;
  size_bytes?: number;
  duration_ms?: number;
}

export interface UploadProgress {
  videoId: string;
  loaded: number;
  total: number;
  percentage: number;
}

export type VideoAvailabilityStatus =
  | "synced_online"
  | "synced_offline"
  | "local_only"
  | "uploading"
  | "failed";

export const getVideoAvailabilityStatus = (
  video: Video,
  isCloudAvailable: boolean
): VideoAvailabilityStatus => {
  const isSyncedToCloud = video.upload_status_cloud === "success";
  const hasCloudPath = !!video.cloud_path;

  if (isSyncedToCloud && hasCloudPath) {
    return isCloudAvailable ? "synced_online" : "synced_offline";
  }

  if (video.upload_status_cloud === "uploading" || video.upload_status_private === "uploading") {
    return "uploading";
  }

  if (video.upload_status_cloud === "failed" || video.upload_status_private === "failed") {
    return "failed";
  }

  return "local_only";
};