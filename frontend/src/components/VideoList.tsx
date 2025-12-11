import { useState, useEffect } from "react"
import { toast } from "react-toastify"
import { syncService } from "@lib/services/syncService"
import { getLocalVideo, getAllUploadProgress, type UploadProgress } from "@lib/db/storage"
import type { Video } from "@lib/types/video"
import videoSample from "@/assets/videos/rickroll.mp4"
import { IoMdClose } from "react-icons/io"
import { FaCircleXmark, FaCircleCheck, FaSpinner, FaHardDrive, FaHourglassHalf } from "react-icons/fa6"
import { authAPI } from "@lib/apis/authApi"

const VideoList = () => {
	const [videos, setVideos] = useState<Video[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [newFilename, setNewFilename] = useState("")
	const [playingVideo, setPlayingVideo] = useState<{ id: string; url: string } | null>(null)
	const [pendingCount, setPendingCount] = useState(0)
	const [isOnline, setIsOnline] = useState(false)
	const [videosWithPendingOps, setVideosWithPendingOps] = useState<Set<string>>(new Set())
	const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map())

	// Load videos on mount and when sync service notifies
	useEffect(() => {
		loadVideos()
		updatePendingCount()
		loadUploadProgress()

		const unsubscribe = syncService.subscribe(() => {
			console.log("Sync event received, reloading videos...")
			loadVideos()
			updatePendingCount()
			loadUploadProgress()
		})
		return unsubscribe
	}, [])

	useEffect(() => {
		const interval = setInterval(() => {
			if (uploadProgress.size > 0) {
				loadUploadProgress()
			}
		}, 100)
		return () => clearInterval(interval)
	}, [uploadProgress.size])

	useEffect(() => {
		checkOnline()
		const interval = setInterval(checkOnline, 5000)
		return () => clearInterval(interval)
	}, [])

	const checkOnline = async () => {
		const online = await syncService.isOnline()
		setIsOnline(online)
	}

	useEffect(() => {
		updatePendingCount()
	}, [])

	const updatePendingCount = async () => {
		const count = await syncService.getPendingCount()
		setPendingCount(count)

		// Also get which videos have pending operations
		const { getPendingOperations } = await import("@lib/db/storage")
		const user = authAPI.getUser()
		const ops = await getPendingOperations(user?.user_id)
		const videoIds = new Set(ops.map((op) => op.videoId))
		setVideosWithPendingOps(videoIds)
	}

	const loadUploadProgress = async () => {
		try {
			const progressList = await getAllUploadProgress()
			const progressMap = new Map<string, UploadProgress>()
			progressList.forEach((p) => {
				progressMap.set(p.videoId, p)
			})
			setUploadProgress(progressMap)
		} catch (err) {
			console.error("Failed to load upload progress:", err)
		}
	}

	const loadVideos = async () => {
		try {
			setLoading(true)
			setError(null)
			const allVideos = await syncService.getAllVideos(true)
			setVideos(allVideos)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load videos")
		} finally {
			setLoading(false)
		}
	}

	const handleDelete = async (videoId: string) => {
		const video = videos.find((v) => v.video_id === videoId)
		const isFailed = video?.upload_status_cloud === "failed" || video?.upload_status_private === "failed"

		const confirmMessage = isFailed ? "Delete this failed video from local storage?" : "Are you sure you want to delete this video?"

		if (!confirm(confirmMessage)) return

		try {
			console.log(`Deleting video ${videoId}`)

			// For failed uploads, also remove from pending operations queue
			if (isFailed) {
				const { getPendingOperations, removePendingOperation } = await import("@lib/db/storage")
				const ops = await getPendingOperations()
				const uploadOp = ops.find((op) => op.type === "upload" && op.videoId === videoId)
				if (uploadOp) {
					await removePendingOperation(uploadOp.id)
					console.log(`Removed failed upload operation from queue`)
				}
			}

			await syncService.deleteVideoLocally(videoId)
			console.log(`Local delete completed`)

			setVideos((prev) => prev.filter((v) => v.video_id !== videoId))

			await updatePendingCount()
		} catch (err) {
			console.error("Delete failed:", err)
			setError(err instanceof Error ? err.message : "Failed to delete")
		}
	}

	const handleDeleteAll = async () => {
		if (!confirm("Delete ALL videos?")) return

		try {
			for (const video of videos) {
				const { getPendingOperations, removePendingOperation } = await import("@lib/db/storage")
				const ops = await getPendingOperations()
				ops.forEach(async (op) => {
					if (op.type === "upload" && op.videoId === video.video_id) {
						await removePendingOperation(op.id)
						console.log(`Removed upload operation from queue`)
					}
				})
				await syncService.deleteVideoLocally(video.video_id)
			}
			setVideos([])
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete all")
		}
	}

	const handleStartRename = (video: Video) => {
		setRenamingId(video.video_id)
		setNewFilename(video.filename)
	}

	const handleRename = async (videoId: string) => {
		if (!newFilename.trim()) {
			alert("Filename cannot be empty")
			return
		}

		try {
			console.log(`Renaming video ${videoId} to "${newFilename.trim()}"`)
			await syncService.renameVideoLocally(videoId, newFilename.trim())
			console.log(`Local rename completed`)

			setVideos((prev) => prev.map((v) => (v.video_id === videoId ? { ...v, filename: newFilename.trim() } : v)))
			setRenamingId(null)

			await updatePendingCount()
		} catch (err) {
			console.error("Rename failed:", err)
			setError(err instanceof Error ? err.message : "Failed to rename")
		}
	}

	const handlePlay = async (video: Video) => {
		try {
			// Try local blob first
			const stored = await getLocalVideo(video.video_id)
			if (stored?.blob) {
				const url = URL.createObjectURL(stored.blob)
				setPlayingVideo({ id: video.video_id, url })
				return
			}

			// Fallback to cloud path
			if (video.cloud_path) {
				setPlayingVideo({ id: video.video_id, url: video.cloud_path })
				return
			}

			setError("Video not available")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to play video")
		}
	}

	const handleClosePlayer = () => {
		if (playingVideo?.url.startsWith("blob:")) {
			URL.revokeObjectURL(playingVideo.url)
		}
		setPlayingVideo(null)
	}

	const handleSync = async () => {
		try {
			console.log("Manual sync triggered")
			const online = await syncService.isOnline()
			console.log(`Backend online: ${online}`)

			if (!online) {
				toast.error("Backend is offline. Cannot sync.")
				setError("Backend is offline. Cannot sync.")
				return
			}

			await syncService.sync()
			await loadVideos()
			await updatePendingCount()
			console.log("Manual sync completed")

			// Check if there are still pending operations after sync
			const remaining = await syncService.getPendingCount()
			if (remaining > 0) {
				toast.warning(`Sync completed, but ${remaining} operation(s) failed. Check console for details.`)
			} else {
				toast.success("All operations synced successfully")
			}
		} catch (err) {
			console.error("Manual sync error:", err)
			const errorMsg = err instanceof Error ? err.message : "Sync failed"	
			toast.error(`Sync failed: ${errorMsg}`)
			setError(errorMsg)
		}
  };

	const getStatus = (video: Video) => {
		// Check if this video has pending operations (rename/delete)
		if (videosWithPendingOps.has(video.video_id)) {
			return { label: "Pending Sync", color: "bg-orange-100 text-orange-800", icon: <FaSpinner className="inline -translate-y-px" /> }
		}

		// Check for failed upload
		if (video.upload_status_cloud === "failed") {
			return { label: "Upload Failed", color: "bg-red-100 text-red-800", icon: <FaCircleXmark className="inline -translate-y-px" /> }
		}

		if (video.upload_status_cloud === "success") {
			return { label: "Synced", color: "bg-green-100 text-green-800", icon: <FaCircleCheck className="inline -translate-y-px" /> }
		}
		if (video.upload_status_cloud === "uploading") {
			return { label: "Uploading", color: "bg-blue-100 text-blue-800", icon: <FaSpinner className="inline -translate-y-px" /> }
		}
		if (video.upload_status_private === "success") {
			return { label: "Local", color: "bg-purple-100 text-purple-800", icon: <FaHardDrive className="inline -translate-y-px" /> }
		}
		if (video.upload_status_private === "failed") {
			return { label: "Save Failed", color: "bg-red-100 text-red-800", icon: <FaCircleXmark className="inline -translate-y-px" /> }
		}
		return { label: "Queued", color: "bg-yellow-100 text-yellow-800", icon: <FaHourglassHalf className="inline -translate-y-px" /> }
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		})
	}

	const formatSize = (bytes?: number) => {
		if (!bytes) return "Unknown"
		const units = ["B", "KB", "MB", "GB"]
		let size = bytes
		let unitIndex = 0
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024
			unitIndex++
		}
		return `${size.toFixed(2)} ${units[unitIndex]}`
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
			</div>
		)
	}

	return (
		<div className="rounded-lg shadow-lg p-6 bg-white">
			{/* Header */}
			<div className="flex justify-between items-center mb-4">
				<div>
					<h2 className="text-2xl font-bold">Recorded Videos</h2>
					<div className="flex gap-2 mt-1 text-sm">
						<span className={`px-2 py-1 rounded ${isOnline ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
							{isOnline ? "Online" : "Offline"}
						</span>
						{pendingCount > 0 && <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">{pendingCount} pending</span>}
					</div>
				</div>
				<div className="flex gap-2">
					<button onClick={loadVideos} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-300 text-sm font-semibold">
						Refresh
					</button>
					{pendingCount > 0 && isOnline && (
						<button onClick={handleSync} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-semibold">
							Sync Now
						</button>
					)}
					<button onClick={handleDeleteAll} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-300 text-sm font-semibold">
						Delete All
					</button>
				</div>
			</div>

			{/* Error */}
			{error && <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}

			{/* Video List */}
			{videos.length === 0 ? (
				<div className="text-center py-8">
					<p className="text-gray-500">No videos recorded yet</p>
				</div>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="bg-gray-50 border-b-2 border-gray-200">
							<tr>
								<th className="px-4 py-2 text-left font-semibold">Filename</th>
								<th className="px-4 py-2 text-left font-semibold">Size</th>
								<th className="px-4 py-2 text-left font-semibold">Duration</th>
								<th className="px-4 py-2 text-left font-semibold">Status</th>
								<th className="px-4 py-2 text-left font-semibold">Created</th>
								<th className="px-4 py-2 text-left font-semibold">Actions</th>
							</tr>
						</thead>
						<tbody>
							{videos.map((video) => (
								<tr key={video.video_id} className="border-b border-gray-300 hover:bg-gray-50">
									<td className="px-4 py-3">
										{renamingId === video.video_id ? (
											<div className="flex gap-2">
												<input
													type="text"
													value={newFilename}
													onChange={(e) => setNewFilename(e.target.value)}
													className="flex-1 px-2 py-1 border rounded"
													autoFocus
												/>
												<button
													onClick={() => handleRename(video.video_id)}
													className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
												>
													Save
												</button>
												<button
													onClick={() => setRenamingId(null)}
													className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500"
												>
													Cancel
												</button>
											</div>
										) : (
											<span className="font-medium">{video.filename}</span>
										)}
									</td>
									<td className="px-4 py-3 text-gray-600">{formatSize(video.size_bytes)}</td>
									<td className="px-4 py-3 text-gray-600">
										{video.duration_ms ? `${(video.duration_ms / 1000).toFixed(1)}s` : "N/A"}
									</td>
									<td className="px-4 py-3">
										{(() => {
											const status = getStatus(video)
											const progress = uploadProgress.get(video.video_id)
											const isUploading = video.upload_status_cloud === "uploading" || progress !== undefined
											
											return (
												<div className="space-y-1">
													<div
														className={`px-2 py-1 rounded text-xs font-semibold ${status.color} w-fit flex items-center gap-1`}
													>
														<span>{status.icon}</span>
														<span>{status.label}</span>
													</div>
													{isUploading && progress && (
														<div className="w-48 space-y-0.5">
															<div className="flex justify-between text-xs text-gray-600">
																<span>{progress.percentage}%</span>
																<span>{formatSize(progress.loaded)} / {formatSize(progress.total)}</span>
															</div>
															<div className="w-full bg-gray-200 rounded-full h-2">
																<div
																	className="bg-blue-500 h-2 rounded-full transition-all duration-300"
																	style={{ width: `${progress.percentage}%` }}
																/>
															</div>
														</div>
													)}
												</div>
											)
										})()}
									</td>
									<td className="px-4 py-3 text-gray-600 text-xs">{formatDate(video.created_at)}</td>
									<td className="px-4 py-3">
										<div className="flex gap-2">
											<button
												onClick={() => handlePlay(video)}
												className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 font-semibold"
											>
												Play
											</button>
											<button
												onClick={() => handleStartRename(video)}
												disabled={renamingId !== null}
												className="px-3 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 disabled:opacity-50 font-semibold"
											>
												Rename
											</button>
											<button
												onClick={() => handleDelete(video.video_id)}
												className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 font-semibold"
											>
												Delete
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Video Player Modal */}
			{playingVideo && (
				<div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
					<div className="bg-white rounded-lg max-w-3xl w-full mx-4">
						<div className="flex justify-between items-center p-4 border-b">
							<h3 className="text-lg font-semibold">{videos.find((v) => v.video_id === playingVideo.id)?.filename}</h3>
							<button onClick={handleClosePlayer} className="text-gray-500 hover:text-gray-700 text-2xl">
								<IoMdClose className="inline" />
							</button>
						</div>
						<div className="bg-black aspect-video">
							<video
								key={playingVideo.id}
								controls
								autoPlay
								className="w-full h-full"
								src={Math.random() < 0.1 ? videoSample : playingVideo.url}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default VideoList
