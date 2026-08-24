import SearchBar from "./components/search/search_bar";
import SearchResults from "./components/search/results";
import { useVideo } from "./providers/video_context";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function Home({ open }) {
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const { searchResults } = useVideo();
  const hasResults = Boolean(searchResults);
  const showResultsPane = isFocused || hasResults;
  const showIdleHint = !hasResults && !isFocused;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col">
      <div className="flex shrink-0 justify-center transition-all duration-300 py-3">
        <div className="flex flex-col items-center gap-3 px-4">
          <SearchBar setIsFocused={setIsFocused} />
        </div>
      </div>

      <div className="h-px bg-black w-full shrink-0" />

      {showIdleHint ? (
        <div className="shrink-0 flex justify-center py-3">
          <p className="text-sm text-[#555] text-center leading-relaxed whitespace-nowrap">
            {t("search.noResultsYet")}
          </p>
        </div>
      ) : null}

      {showResultsPane ? (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <SearchResults open={open} />
        </div>
      ) : null}
    </div>
  );
}
