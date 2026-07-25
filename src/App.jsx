import "./App.css";

import FileDesc from "./components/download/file_desc";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SideBar from "./components/menu/sidebar";
import TitleBar from "./components/menu/titlebar";
import { useState } from "react";
import { VideoProvider } from "./providers/video_context";
import { DownloadPathProvider } from "./providers/download_path_context";
import { DownloadQueueProvider } from "./providers/download_queue_context";
import Home from "./home";

function App() {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);

  return (
    <VideoProvider>
      <DownloadPathProvider>
        <DownloadQueueProvider>
          <main
            className={`app-shell flex flex-col font-montreal ${
              maximized ? "app-shell--maximized" : "app-shell--windowed"
            }`}
          >
            <TitleBar onMaximizedChange={setMaximized} />
            <div className="flex-1 panel-fill flex flex-col min-h-0">
              <BrowserRouter>
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <SideBar open={open} setOpen={setOpen} />
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <Routes>
                      <Route path="/" element={<Home open={open} />} />
                      <Route path="/val" element={<FileDesc />} />
                    </Routes>
                  </div>
                </div>
              </BrowserRouter>
            </div>
          </main>
        </DownloadQueueProvider>
      </DownloadPathProvider>
    </VideoProvider>
  );
}

export default App;
