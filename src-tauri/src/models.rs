use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
pub struct Download {
    #[serde(skip_deserializing)]
    pub title: String,
    #[serde(default)]
    pub status: String,
    #[serde(default, alias = "filepath")]
    pub filename: Option<String>,
    #[serde(rename(deserialize = "_percent_str"))]
    pub percentage: Option<String>,
    #[serde(rename(deserialize = "_speed_str"))]
    pub speed: Option<String>,
    #[serde(rename(deserialize = "_eta_str"))]
    pub eta: Option<String>,
    #[serde(rename(deserialize = "_downloaded_bytes_str"))]
    pub bytes_downloaded: Option<String>,
    #[serde(
        rename(deserialize = "_total_bytes_estimate_str"),
        alias = "_total_bytes_str"
    )]
    pub file_size: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct DownloadConfig {
    pub url: String,
    pub title: String,
    pub output_dir: Option<String>,
    pub output_ext: Option<String>,
    pub format: Option<String>,
    pub proxy_url: Option<String>,
    pub embed_subtitles: Option<bool>,
    #[serde(alias = "embed_metada")]
    pub embed_metadata: Option<bool>,
    pub embed_thumbnail: Option<bool>,
    pub duration_raw: Option<f64>,
    pub cookies_file: Option<String>,
    pub cookies_from_browser: Option<String>,
    /// "cache" = player temp media; skipped from user download history on the FE.
    #[serde(default)]
    pub purpose: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Format {
    #[serde(rename(deserialize = "format_id"))]
    pub id: String,
    #[serde(rename(deserialize = "tbr"))]
    pub bitrate: Option<f64>,
    #[serde(rename(deserialize = "acodec"))]
    pub audio_codec: Option<String>,
    #[serde(rename(deserialize = "vcodec"))]
    pub video_codec: Option<String>,
    #[serde(rename(deserialize = "asr"))]
    pub sample_rate: Option<i64>,
    #[serde(rename(deserialize = "filesize"), skip_serializing)]
    pub filesize_raw: Option<i64>,
    #[serde(skip_deserializing)]
    pub filesize: Option<String>,

    pub fps: Option<f64>,
    pub resolution: Option<String>,
    pub dynamic_range: Option<String>,
    #[serde(default)]
    pub ext: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Video {
    pub title: String,
    #[serde(rename(deserialize = "id"))]
    pub url: String,
    #[serde(default)]
    pub uploader: String,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(rename(deserialize = "duration"), default)]
    pub duration_raw: i64,
    #[serde(rename(deserialize = "duration_string"), default)]
    pub duration: String,
    #[serde(default)]
    pub view_count: Option<i64>,
    #[serde(default)]
    pub like_count: Option<i64>,
    /// yt-dlp format `YYYYMMDD` when present.
    #[serde(default)]
    pub upload_date: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub live_status: Option<String>,
    pub formats: Option<Vec<Format>>,
}

pub fn parse_video_details(mut video_details: Video) -> Video {
    // Only rewrite when we got a bare YouTube id (not an already absolute URL).
    if !video_details.url.starts_with("http://") && !video_details.url.starts_with("https://") {
        video_details.url = format!("https://www.youtube.com/watch?v={}", video_details.url);
    }

    if let Some(formats) = video_details.formats.as_mut() {
        formats.reverse();
        for format in formats.iter_mut() {
            const MB: f64 = 1024.0 * 1024.0;

            format.filesize = Some(if let Some(filesize) = format.filesize_raw {
                format!("{:.2} MB", filesize as f64 / MB)
            } else if let Some(bitrate) = format.bitrate {
                let estimated_size = (bitrate * video_details.duration_raw as f64) / (8.0 * 1024.0);
                format!("~{:.2} MB", estimated_size)
            } else {
                "Unknown".to_string()
            });
        }
    }

    video_details
}
