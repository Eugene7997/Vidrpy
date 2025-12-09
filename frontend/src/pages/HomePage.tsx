import { useState } from "react";
import VideoRecorder from "@components/VideoRecorder";
import VideoList from "@components/VideoList";
import Header from "@components/Header";
import Footer from "@components/Footer";
import { FaList, FaVideo } from "react-icons/fa6";

const HomePage = () => {
  const [activeTab, setActiveTab] = useState<"record" | "videos" | "display">("record");

  return (
    <div className="min-h-screen">
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          <button
            onClick={() => setActiveTab("record")}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === "record"
                ? "bg-gray-400 text-slate-50 shadow-lg"
                : "bg-gray-100 hover:bg-gray-300"
            }`}
          >
            <FaVideo className="inline -translate-y-px" /> Record Video
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === "videos"
                ? "bg-gray-400 text-slate-50 shadow-lg"
                : "bg-gray-100 hover:bg-gray-300"
            }`}
          >
            <FaList className="inline -translate-y-[2px]" /> My Videos
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === "record" && (
            <div className="animate-fade-in">
              <VideoRecorder />
            </div>
          )}

          {activeTab === "videos" && (
            <div className="animate-fade-in">
              <VideoList />
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;