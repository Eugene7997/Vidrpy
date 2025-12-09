import { useState, useEffect, useRef } from "react"
import { useVideoRecorder } from "@lib/hooks/useVideoRecorder"
import { syncService } from "@lib/services/syncService"
import { FaCamera } from "react-icons/fa6"
import { toast } from "react-toastify"

interface RecorderComponentState {
	isSaving: boolean
	saveError: string | null
}

const VideoRecorder = () => {
	const recorder = useVideoRecorder()
	const videoRef = useRef<HTMLVideoElement>(null)

	const [componentState, setComponentState] = useState<RecorderComponentState>({
		isSaving: false,
		saveError: null,
	})
	const [recordingTime, setRecordingTime] = useState(0)

	// Track recording time
	useEffect(() => {
		if (!recorder.isRecording) return

		const interval = setInterval(() => {
			setRecordingTime((prev) => prev + 1)
		}, 1000)

		return () => clearInterval(interval)
	}, [recorder.isRecording])

	// Stream webcam to video element
	useEffect(() => {
		if (recorder.stream && videoRef.current) {
			videoRef.current.srcObject = recorder.stream
		}
	}, [recorder.stream])

	const handleStartRecording = async () => {
		setRecordingTime(0)
		await recorder.startRecording()
	}

	const handleStopRecording = async () => {
		const blob = await recorder.stopRecording()
		if (blob) {
			await handleSaveVideo(blob, recordingTime)
		}
	}

	const handleSaveVideo = async (blob: Blob, durationSeconds: number) => {
		try {
			setComponentState((prev) => ({ ...prev, isSaving: true, saveError: null }))

			const filename = `recording_${Date.now()}.webm`

			await syncService.createVideoLocally(
				{
					filename,
					size_bytes: blob.size,
					duration_ms: durationSeconds * 1000,
				},
				blob
			)

			setComponentState((prev) => ({
				...prev,
				isSaving: false,
			}))

			toast.success("Video saved! It will be synced to the cloud automatically.")

			setRecordingTime(0)
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to save video"
			setComponentState((prev) => ({
				...prev,
				isSaving: false,
				saveError: errorMsg,
			}))
		}
	}

	const formatTime = (seconds: number) => {
		const hrs = Math.floor(seconds / 3600)
		const mins = Math.floor((seconds % 3600) / 60)
		const secs = seconds % 60
		return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
	}

	return (
		<div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-2xl font-bold">Record Video</h2>
				{recorder.isRecording && (
					<button
						onClick={recorder.toggleMirror}
						className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-sm font-semibold transition-colors"
						title={recorder.isMirrored ? "Disable mirror" : "Enable mirror"}
					>
						{recorder.isMirrored ? "Mirrored" : "Normal"}
					</button>
				)}
			</div>

			{/* Error Messages */}
			{recorder.error && <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{recorder.error}</div>}

			{componentState.saveError && (
				<div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{componentState.saveError}</div>
			)}

			{/* Video Preview / Recording */}
			<div className="bg-black rounded-lg mb-4 aspect-video flex items-center justify-center relative overflow-hidden">
				{recorder.isRecording ? (
					<>
						<video
							ref={videoRef}
							autoPlay
							playsInline
							className={`w-full h-full object-cover ${recorder.isMirrored ? "scale-x-[-1]" : ""}`}
						/>
						<div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
							<div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded">
								<div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
								<span className="text-white text-sm font-semibold">{formatTime(recordingTime)}</span>
							</div>
						</div>
					</>
				) : (
					<div className="text-gray-400 text-center">
						<div className="text-6xl mb-2">
							<FaCamera className="inline" />
						</div>
						<div>Ready to record</div>
					</div>
				)}
			</div>

			{/* Recording Time Display */}
			{recorder.isRecording && (
				<div className="text-center mb-4">
					<p className="text-lg font-semibold">Recording time: {formatTime(recordingTime)}</p>
				</div>
			)}

			{/* Controls */}
			<div className="flex gap-3 justify-center">
				{!recorder.isRecording ? (
					<button
						onClick={handleStartRecording}
						disabled={componentState.isSaving}
						className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
					>
						Start Recording
					</button>
				) : (
					<>
						<button
							onClick={handleStopRecording}
							disabled={componentState.isSaving}
							className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
						>
							Stop & Save
						</button>
						<button
							onClick={recorder.cancelRecording}
							disabled={componentState.isSaving}
							className="px-6 py-2 bg-gray-300  rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
						>
							Cancel
						</button>
					</>
				)}
			</div>

			{componentState.isSaving && (
				<div className="mt-4 text-center">
					<p className="text-gray-600">Saving your video...</p>
				</div>
			)}
		</div>
	)
}

export default VideoRecorder
