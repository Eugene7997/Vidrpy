import type { Video } from "@lib/types/video";

const DB_NAME = "Viddy";
const DB_VERSION = 6;

export interface StoredVideo {
  video: Video;
  blob?: Blob;
}

export interface PendingOperation {
  id: string;
  type: "upload" | "rename" | "delete";
  videoId: string;
  data: Record<string, any>;
  createdAt: number;
}

export interface UploadProgress {
  videoId: string;
  loaded: number;
  total: number;
  percentage: number;
  updatedAt: number;
}

let db: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      // Videos store
      if (!database.objectStoreNames.contains("videos")) {
        database.createObjectStore("videos", { keyPath: "video.video_id" });
      }

      // Pending operations store
      if (!database.objectStoreNames.contains("pendingOperations")) {
        database.createObjectStore("pendingOperations", { keyPath: "id" });
      }

      // Upload progress store
      if (!database.objectStoreNames.contains("uploadProgress")) {
        database.createObjectStore("uploadProgress", { keyPath: "videoId" });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function saveVideo(video: Video, blob?: Blob): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["videos"], "readwrite");
    const store = tx.objectStore("videos");
    
    const storedVideo: StoredVideo = { video, blob };
    const request = store.put(storedVideo);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalVideo(videoId: string): Promise<StoredVideo | null> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["videos"], "readonly");
    const store = tx.objectStore("videos");
    const request = store.get(videoId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalVideos(): Promise<Video[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["videos"], "readonly");
    const store = tx.objectStore("videos");
    const request = store.getAll();

    request.onsuccess = () => {
      const storedVideos = request.result as StoredVideo[];
      resolve(storedVideos.map(sv => sv.video));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteVideo(videoId: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["videos"], "readwrite");
    const store = tx.objectStore("videos");
    const request = store.delete(videoId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function addPendingOperation(
  op: Omit<PendingOperation, "id">
): Promise<string> {
  const database = await getDB();
  const id = `${op.type}_${op.videoId}_${Date.now()}`;

  return new Promise((resolve, reject) => {
    const tx = database.transaction(["pendingOperations"], "readwrite");
    const store = tx.objectStore("pendingOperations");
    const request = store.put({ ...op, id });

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["pendingOperations"], "readonly");
    const store = tx.objectStore("pendingOperations");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removePendingOperation(id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["pendingOperations"], "readwrite");
    const store = tx.objectStore("pendingOperations");
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveUploadProgress(progress: UploadProgress): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["uploadProgress"], "readwrite");
    const store = tx.objectStore("uploadProgress");
    const request = store.put({ ...progress, updatedAt: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUploadProgress(videoId: string): Promise<UploadProgress | null> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["uploadProgress"], "readonly");
    const store = tx.objectStore("uploadProgress");
    const request = store.get(videoId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllUploadProgress(): Promise<UploadProgress[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["uploadProgress"], "readonly");
    const store = tx.objectStore("uploadProgress");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteUploadProgress(videoId: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["uploadProgress"], "readwrite");
    const store = tx.objectStore("uploadProgress");
    const request = store.delete(videoId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

